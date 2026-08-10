use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount};
use mpl_token_metadata::instruction as mpl_instruction;
use mpl_token_metadata::state::{Creator, DataV2};

declare_id!("WVWZdynNFT111111111111111111111111111111111");

// ============================================================
//  WAVEWARZ DYNAMIC NFT PROGRAM
//  SVM-Compatible | Metaplex | Audius | txtx
//  Royalties: 1–10% | Live Battle Adaptive Metadata
// ============================================================

pub mod constants {
    pub const MAX_ROYALTY_BPS: u16 = 1000;   // 10%
    pub const MIN_ROYALTY_BPS: u16 = 100;    // 1%
    pub const BATTLE_FEE_BPS: u16 = 250;     // 2.5% platform fee
    pub const MAX_STREAM_BOOST: u64 = 10_000;
    pub const PRICE_UPDATE_COOLDOWN: i64 = 60; // seconds
    pub const AUDIUS_ORACLE_SEED: &[u8] = b"audius_oracle";
    pub const BATTLE_SEED: &[u8] = b"battle";
    pub const NFT_STATE_SEED: &[u8] = b"nft_state";
}

// ============================================================
// PROGRAM ENTRY POINTS
// ============================================================

#[program]
pub mod wavewarz_dynamic_nft {
    use super::*;

    // ---- 1. INITIALIZE PROGRAM CONFIG ----------------------
    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        platform_fee_bps: u16,
        audius_oracle: Pubkey,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.platform_fee_bps = platform_fee_bps;
        config.audius_oracle = audius_oracle;
        config.total_battles = 0;
        config.total_nfts_minted = 0;
        config.bump = *ctx.bumps.get("config").unwrap();
        emit!(ConfigInitialized {
            authority: config.authority,
            audius_oracle,
        });
        Ok(())
    }

    // ---- 2. CREATE A BATTLE --------------------------------
    pub fn create_battle(
        ctx: Context<CreateBattle>,
        battle_id: u64,
        artist_a: Pubkey,
        artist_b: Pubkey,
        audius_track_id_a: String,
        audius_track_id_b: String,
        start_time: i64,
        end_time: i64,
        royalty_bps_a: u16,
        royalty_bps_b: u16,
    ) -> Result<()> {
        require!(
            royalty_bps_a >= constants::MIN_ROYALTY_BPS && royalty_bps_a <= constants::MAX_ROYALTY_BPS,
            WaveWarzError::InvalidRoyaltyRange
        );
        require!(
            royalty_bps_b >= constants::MIN_ROYALTY_BPS && royalty_bps_b <= constants::MAX_ROYALTY_BPS,
            WaveWarzError::InvalidRoyaltyRange
        );
        require!(end_time > start_time, WaveWarzError::InvalidBattleTimes);

        let battle = &mut ctx.accounts.battle;
        battle.battle_id = battle_id;
        battle.artist_a = artist_a;
        battle.artist_b = artist_b;
        battle.audius_track_id_a = audius_track_id_a.clone();
        battle.audius_track_id_b = audius_track_id_b.clone();
        battle.start_time = start_time;
        battle.end_time = end_time;
        battle.royalty_bps_a = royalty_bps_a;
        battle.royalty_bps_b = royalty_bps_b;
        battle.stream_count_a = 0;
        battle.stream_count_b = 0;
        battle.votes_a = 0;
        battle.votes_b = 0;
        battle.floor_price_a = 0;
        battle.floor_price_b = 0;
        battle.total_volume_a = 0;
        battle.total_volume_b = 0;
        battle.status = BattleStatus::Active;
        battle.winner = None;
        battle.bump = *ctx.bumps.get("battle").unwrap();

        let config = &mut ctx.accounts.config;
        config.total_battles += 1;

        emit!(BattleCreated {
            battle_id,
            artist_a,
            artist_b,
            audius_track_id_a,
            audius_track_id_b,
            start_time,
            end_time,
        });
        Ok(())
    }

    // ---- 3. MINT DYNAMIC NFT FOR A BATTLE SIDE -------------
    pub fn mint_battle_nft(
        ctx: Context<MintBattleNft>,
        battle_id: u64,
        side: BattleSide,
        initial_price: u64,
        metadata_uri: String,
        nft_name: String,
    ) -> Result<()> {
        let battle = &ctx.accounts.battle;
        require!(
            battle.status == BattleStatus::Active,
            WaveWarzError::BattleNotActive
        );

        let nft_state = &mut ctx.accounts.nft_state;
        nft_state.battle_id = battle_id;
        nft_state.side = side.clone();
        nft_state.owner = ctx.accounts.buyer.key();
        nft_state.mint = ctx.accounts.mint.key();
        nft_state.current_price = initial_price;
        nft_state.base_price = initial_price;
        nft_state.metadata_uri = metadata_uri.clone();
        nft_state.last_price_update = Clock::get()?.unix_timestamp;
        nft_state.stream_snapshot = match side {
            BattleSide::A => battle.stream_count_a,
            BattleSide::B => battle.stream_count_b,
        };
        nft_state.royalty_bps = match side {
            BattleSide::A => battle.royalty_bps_a,
            BattleSide::B => battle.royalty_bps_b,
        };
        nft_state.artist = match side {
            BattleSide::A => battle.artist_a,
            BattleSide::B => battle.artist_b,
        };
        nft_state.bump = *ctx.bumps.get("nft_state").unwrap();

        // Update battle floor price
        let battle_mut = &mut ctx.accounts.battle;
        match side {
            BattleSide::A => {
                if battle_mut.floor_price_a == 0 || initial_price < battle_mut.floor_price_a {
                    battle_mut.floor_price_a = initial_price;
                }
            }
            BattleSide::B => {
                if battle_mut.floor_price_b == 0 || initial_price < battle_mut.floor_price_b {
                    battle_mut.floor_price_b = initial_price;
                }
            }
        }

        let config = &mut ctx.accounts.config;
        config.total_nfts_minted += 1;

        emit!(NftMinted {
            battle_id,
            side,
            mint: ctx.accounts.mint.key(),
            owner: ctx.accounts.buyer.key(),
            initial_price,
        });
        Ok(())
    }

    // ---- 4. UPDATE STREAM DATA (Audius Oracle) --------------
    pub fn update_stream_data(
        ctx: Context<UpdateStreamData>,
        stream_count_a: u64,
        stream_count_b: u64,
        timestamp: i64,
    ) -> Result<()> {
        let config = &ctx.accounts.config;
        require!(
            ctx.accounts.oracle.key() == config.audius_oracle,
            WaveWarzError::UnauthorizedOracle
        );

        let battle = &mut ctx.accounts.battle;
        require!(
            battle.status == BattleStatus::Active,
            WaveWarzError::BattleNotActive
        );

        let prev_a = battle.stream_count_a;
        let prev_b = battle.stream_count_b;

        battle.stream_count_a = stream_count_a;
        battle.stream_count_b = stream_count_b;
        battle.last_oracle_update = timestamp;

        emit!(StreamDataUpdated {
            battle_id: battle.battle_id,
            stream_count_a,
            stream_count_b,
            delta_a: stream_count_a.saturating_sub(prev_a),
            delta_b: stream_count_b.saturating_sub(prev_b),
            timestamp,
        });
        Ok(())
    }

    // ---- 5. ADAPT NFT PRICE (Dynamic Metadata Engine) ------
    /// Recalculates NFT price based on live stream counts and battle votes.
    /// Price = base_price * (1 + stream_boost_ratio) * vote_multiplier
    pub fn adapt_nft_price(
        ctx: Context<AdaptNftPrice>,
    ) -> Result<()> {
        let battle = &ctx.accounts.battle;
        let nft_state = &mut ctx.accounts.nft_state;
        let clock = Clock::get()?;

        require!(
            clock.unix_timestamp - nft_state.last_price_update >= constants::PRICE_UPDATE_COOLDOWN,
            WaveWarzError::UpdateCooldownActive
        );
        require!(
            battle.status == BattleStatus::Active,
            WaveWarzError::BattleNotActive
        );

        let (streams, total_streams, votes, total_votes) = match nft_state.side {
            BattleSide::A => (
                battle.stream_count_a,
                battle.stream_count_a + battle.stream_count_b,
                battle.votes_a,
                battle.votes_a + battle.votes_b,
            ),
            BattleSide::B => (
                battle.stream_count_b,
                battle.stream_count_a + battle.stream_count_b,
                battle.votes_b,
                battle.votes_a + battle.votes_b,
            ),
        };

        // Stream boost: 0–100% price increase scaled to stream share
        let stream_boost = if total_streams > 0 {
            (streams as u128)
                .saturating_mul(10_000)
                .checked_div(total_streams as u128)
                .unwrap_or(5000) as u64 // basis points (0–10000)
        } else {
            5000u64
        };

        // Vote multiplier: 0.9x – 1.5x
        let vote_multiplier_bps = if total_votes > 0 {
            let vote_share_bps = (votes as u128)
                .saturating_mul(10_000)
                .checked_div(total_votes as u128)
                .unwrap_or(5000) as u64;
            // map 0–10000 share to 9000–15000 bps multiplier
            9000u64 + vote_share_bps * 6 / 10
        } else {
            10_000u64
        };

        // new_price = base * (10000 + stream_boost) / 10000 * vote_multiplier / 10000
        let new_price = (nft_state.base_price as u128)
            .saturating_mul((10_000 + stream_boost) as u128)
            .checked_div(10_000)
            .unwrap_or(nft_state.base_price as u128)
            .saturating_mul(vote_multiplier_bps as u128)
            .checked_div(10_000)
            .unwrap_or(nft_state.base_price as u128) as u64;

        let old_price = nft_state.current_price;
        nft_state.current_price = new_price;
        nft_state.stream_snapshot = streams;
        nft_state.last_price_update = clock.unix_timestamp;

        emit!(NftPriceAdapted {
            mint: nft_state.mint,
            old_price,
            new_price,
            stream_boost,
            vote_multiplier_bps,
        });
        Ok(())
    }

    // ---- 6. UPDATE NFT METADATA URI (Visual Adaptation) ----
    /// Allows authority/oracle to push new metadata URI reflecting battle state.
    pub fn update_metadata_uri(
        ctx: Context<UpdateMetadataUri>,
        new_uri: String,
        battle_phase: BattlePhase,
    ) -> Result<()> {
        let nft_state = &mut ctx.accounts.nft_state;
        nft_state.metadata_uri = new_uri.clone();
        nft_state.battle_phase = battle_phase.clone();

        emit!(MetadataUriUpdated {
            mint: nft_state.mint,
            new_uri,
            battle_phase,
        });
        Ok(())
    }

    // ---- 7. TRADE / SECONDARY SALE with ROYALTY SPLIT ------
    pub fn trade_nft(
        ctx: Context<TradeNft>,
        sale_price: u64,
    ) -> Result<()> {
        let nft_state = &mut ctx.accounts.nft_state;
        let battle = &mut ctx.accounts.battle;

        require!(
            nft_state.current_price > 0,
            WaveWarzError::InvalidPrice
        );

        // Royalty to artist
        let royalty_amount = (sale_price as u128)
            .saturating_mul(nft_state.royalty_bps as u128)
            .checked_div(10_000)
            .unwrap_or(0) as u64;

        // Platform fee
        let platform_fee = (sale_price as u128)
            .saturating_mul(constants::BATTLE_FEE_BPS as u128)
            .checked_div(10_000)
            .unwrap_or(0) as u64;

        let seller_proceeds = sale_price
            .saturating_sub(royalty_amount)
            .saturating_sub(platform_fee);

        // Transfer royalty to artist
        let cpi_accounts_artist = anchor_lang::system_program::Transfer {
            from: ctx.accounts.buyer.to_account_info(),
            to: ctx.accounts.artist_wallet.to_account_info(),
        };
        anchor_lang::system_program::transfer(
            CpiContext::new(ctx.accounts.system_program.to_account_info(), cpi_accounts_artist),
            royalty_amount,
        )?;

        // Transfer platform fee
        let cpi_accounts_platform = anchor_lang::system_program::Transfer {
            from: ctx.accounts.buyer.to_account_info(),
            to: ctx.accounts.platform_wallet.to_account_info(),
        };
        anchor_lang::system_program::transfer(
            CpiContext::new(ctx.accounts.system_program.to_account_info(), cpi_accounts_platform),
            platform_fee,
        )?;

        // Transfer seller proceeds
        let cpi_accounts_seller = anchor_lang::system_program::Transfer {
            from: ctx.accounts.buyer.to_account_info(),
            to: ctx.accounts.seller.to_account_info(),
        };
        anchor_lang::system_program::transfer(
            CpiContext::new(ctx.accounts.system_program.to_account_info(), cpi_accounts_seller),
            seller_proceeds,
        )?;

        // Update battle volume
        match nft_state.side {
            BattleSide::A => battle.total_volume_a += sale_price,
            BattleSide::B => battle.total_volume_b += sale_price,
        }

        // Update NFT ownership
        let prev_owner = nft_state.owner;
        nft_state.owner = ctx.accounts.buyer.key();
        nft_state.base_price = sale_price; // new base for future price adaptation

        emit!(NftTraded {
            mint: nft_state.mint,
            battle_id: nft_state.battle_id,
            seller: prev_owner,
            buyer: ctx.accounts.buyer.key(),
            sale_price,
            royalty_amount,
            royalty_bps: nft_state.royalty_bps,
            platform_fee,
            seller_proceeds,
        });
        Ok(())
    }

    // ---- 8. CAST VOTE ------------------------------------
    pub fn cast_vote(
        ctx: Context<CastVote>,
        side: BattleSide,
    ) -> Result<()> {
        let battle = &mut ctx.accounts.battle;
        let vote_record = &mut ctx.accounts.vote_record;

        require!(
            battle.status == BattleStatus::Active,
            WaveWarzError::BattleNotActive
        );
        require!(!vote_record.has_voted, WaveWarzError::AlreadyVoted);

        match side {
            BattleSide::A => battle.votes_a += 1,
            BattleSide::B => battle.votes_b += 1,
        }

        vote_record.voter = ctx.accounts.voter.key();
        vote_record.battle_id = battle.battle_id;
        vote_record.side = side.clone();
        vote_record.has_voted = true;
        vote_record.timestamp = Clock::get()?.unix_timestamp;

        emit!(VoteCast {
            battle_id: battle.battle_id,
            voter: ctx.accounts.voter.key(),
            side,
        });
        Ok(())
    }

    // ---- 9. END BATTLE & DECLARE WINNER -----------------
    pub fn end_battle(ctx: Context<EndBattle>) -> Result<()> {
        let battle = &mut ctx.accounts.battle;
        let clock = Clock::get()?;

        require!(
            clock.unix_timestamp >= battle.end_time,
            WaveWarzError::BattleStillActive
        );
        require!(
            battle.status == BattleStatus::Active,
            WaveWarzError::BattleAlreadyEnded
        );

        // Determine winner: weighted 60% streams, 40% votes
        let score_a = (battle.stream_count_a as u128).saturating_mul(6)
            + (battle.votes_a as u128).saturating_mul(4);
        let score_b = (battle.stream_count_b as u128).saturating_mul(6)
            + (battle.votes_b as u128).saturating_mul(4);

        battle.winner = Some(if score_a >= score_b {
            BattleSide::A
        } else {
            BattleSide::B
        });
        battle.status = BattleStatus::Ended;
        battle.final_score_a = score_a as u64;
        battle.final_score_b = score_b as u64;

        emit!(BattleEnded {
            battle_id: battle.battle_id,
            winner: battle.winner.clone().unwrap(),
            score_a: score_a as u64,
            score_b: score_b as u64,
            stream_count_a: battle.stream_count_a,
            stream_count_b: battle.stream_count_b,
            votes_a: battle.votes_a,
            votes_b: battle.votes_b,
        });
        Ok(())
    }

    // ---- 10. CLAIM WINNER BONUS (Winner NFTs get bonus) ----
    pub fn claim_winner_bonus(ctx: Context<ClaimWinnerBonus>) -> Result<()> {
        let battle = &ctx.accounts.battle;
        let nft_state = &mut ctx.accounts.nft_state;

        require!(
            battle.status == BattleStatus::Ended,
            WaveWarzError::BattleNotActive
        );

        let winner = battle.winner.as_ref().ok_or(WaveWarzError::NoWinner)?;
        require!(
            std::mem::discriminant(winner) == std::mem::discriminant(&nft_state.side),
            WaveWarzError::NotWinningSide
        );
        require!(!nft_state.winner_bonus_claimed, WaveWarzError::BonusAlreadyClaimed);

        // Apply 20% price bonus for winning NFTs
        nft_state.current_price = nft_state.current_price.saturating_mul(12).checked_div(10).unwrap_or(nft_state.current_price);
        nft_state.winner_bonus_claimed = true;
        nft_state.battle_phase = BattlePhase::Won;

        emit!(WinnerBonusClaimed {
            mint: nft_state.mint,
            battle_id: nft_state.battle_id,
            new_price: nft_state.current_price,
        });
        Ok(())
    }
}

// ============================================================
// ACCOUNT STRUCTS
// ============================================================

#[account]
pub struct ProgramConfig {
    pub authority: Pubkey,
    pub platform_fee_bps: u16,
    pub audius_oracle: Pubkey,
    pub total_battles: u64,
    pub total_nfts_minted: u64,
    pub bump: u8,
}

#[account]
pub struct Battle {
    pub battle_id: u64,
    pub artist_a: Pubkey,
    pub artist_b: Pubkey,
    pub audius_track_id_a: String,    // Audius track ID for artist A
    pub audius_track_id_b: String,    // Audius track ID for artist B
    pub start_time: i64,
    pub end_time: i64,
    pub royalty_bps_a: u16,          // 100–1000 (1%–10%)
    pub royalty_bps_b: u16,
    pub stream_count_a: u64,
    pub stream_count_b: u64,
    pub votes_a: u64,
    pub votes_b: u64,
    pub floor_price_a: u64,
    pub floor_price_b: u64,
    pub total_volume_a: u64,
    pub total_volume_b: u64,
    pub final_score_a: u64,
    pub final_score_b: u64,
    pub last_oracle_update: i64,
    pub status: BattleStatus,
    pub winner: Option<BattleSide>,
    pub bump: u8,
}

#[account]
pub struct NftState {
    pub battle_id: u64,
    pub side: BattleSide,
    pub owner: Pubkey,
    pub artist: Pubkey,
    pub mint: Pubkey,
    pub current_price: u64,
    pub base_price: u64,
    pub royalty_bps: u16,
    pub metadata_uri: String,
    pub stream_snapshot: u64,
    pub last_price_update: i64,
    pub battle_phase: BattlePhase,
    pub winner_bonus_claimed: bool,
    pub bump: u8,
}

#[account]
pub struct VoteRecord {
    pub voter: Pubkey,
    pub battle_id: u64,
    pub side: BattleSide,
    pub has_voted: bool,
    pub timestamp: i64,
}

// ============================================================
// CONTEXTS
// ============================================================

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(
        init, payer = authority, space = 8 + 200,
        seeds = [b"config"], bump
    )]
    pub config: Account<'info, ProgramConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(battle_id: u64)]
pub struct CreateBattle<'info> {
    #[account(
        init, payer = authority, space = 8 + 600,
        seeds = [constants::BATTLE_SEED, &battle_id.to_le_bytes()], bump
    )]
    pub battle: Account<'info, Battle>,
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, ProgramConfig>,
    #[account(mut, constraint = authority.key() == config.authority)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(battle_id: u64)]
pub struct MintBattleNft<'info> {
    #[account(
        init, payer = buyer, space = 8 + 400,
        seeds = [constants::NFT_STATE_SEED, mint.key().as_ref()], bump
    )]
    pub nft_state: Account<'info, NftState>,
    #[account(mut, seeds = [constants::BATTLE_SEED, &battle_id.to_le_bytes()], bump = battle.bump)]
    pub battle: Account<'info, Battle>,
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, ProgramConfig>,
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct UpdateStreamData<'info> {
    #[account(mut)]
    pub battle: Account<'info, Battle>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, ProgramConfig>,
    pub oracle: Signer<'info>,
}

#[derive(Accounts)]
pub struct AdaptNftPrice<'info> {
    #[account(mut, seeds = [constants::NFT_STATE_SEED, nft_state.mint.as_ref()], bump = nft_state.bump)]
    pub nft_state: Account<'info, NftState>,
    #[account(seeds = [constants::BATTLE_SEED, &nft_state.battle_id.to_le_bytes()], bump = battle.bump)]
    pub battle: Account<'info, Battle>,
    pub payer: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateMetadataUri<'info> {
    #[account(mut, seeds = [constants::NFT_STATE_SEED, nft_state.mint.as_ref()], bump = nft_state.bump)]
    pub nft_state: Account<'info, NftState>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, ProgramConfig>,
    #[account(constraint = authority.key() == config.authority || authority.key() == config.audius_oracle)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct TradeNft<'info> {
    #[account(mut, seeds = [constants::NFT_STATE_SEED, nft_state.mint.as_ref()], bump = nft_state.bump)]
    pub nft_state: Account<'info, NftState>,
    #[account(mut, seeds = [constants::BATTLE_SEED, &nft_state.battle_id.to_le_bytes()], bump = battle.bump)]
    pub battle: Account<'info, Battle>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    /// CHECK: verified via nft_state.owner
    #[account(mut, constraint = seller.key() == nft_state.owner)]
    pub seller: AccountInfo<'info>,
    /// CHECK: verified via nft_state.artist
    #[account(mut, constraint = artist_wallet.key() == nft_state.artist)]
    pub artist_wallet: AccountInfo<'info>,
    /// CHECK: platform treasury
    #[account(mut)]
    pub platform_wallet: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(side: BattleSide)]
pub struct CastVote<'info> {
    #[account(mut)]
    pub battle: Account<'info, Battle>,
    #[account(
        init, payer = voter, space = 8 + 80,
        seeds = [b"vote", battle.battle_id.to_le_bytes().as_ref(), voter.key().as_ref()], bump
    )]
    pub vote_record: Account<'info, VoteRecord>,
    #[account(mut)]
    pub voter: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct EndBattle<'info> {
    #[account(mut)]
    pub battle: Account<'info, Battle>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, ProgramConfig>,
    #[account(constraint = authority.key() == config.authority)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ClaimWinnerBonus<'info> {
    #[account(mut, seeds = [constants::NFT_STATE_SEED, nft_state.mint.as_ref()], bump = nft_state.bump)]
    pub nft_state: Account<'info, NftState>,
    #[account(seeds = [constants::BATTLE_SEED, &nft_state.battle_id.to_le_bytes()], bump = battle.bump)]
    pub battle: Account<'info, Battle>,
    #[account(constraint = owner.key() == nft_state.owner)]
    pub owner: Signer<'info>,
}

// ============================================================
// TYPES & ENUMS
// ============================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum BattleSide {
    A,
    B,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum BattleStatus {
    Active,
    Ended,
    Cancelled,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum BattlePhase {
    PreBattle,
    Live,
    Heating,   // side gaining momentum
    Dominating,
    Won,
    Lost,
}

// ============================================================
// EVENTS
// ============================================================

#[event]
pub struct ConfigInitialized { pub authority: Pubkey, pub audius_oracle: Pubkey }

#[event]
pub struct BattleCreated {
    pub battle_id: u64, pub artist_a: Pubkey, pub artist_b: Pubkey,
    pub audius_track_id_a: String, pub audius_track_id_b: String,
    pub start_time: i64, pub end_time: i64,
}

#[event]
pub struct NftMinted {
    pub battle_id: u64, pub side: BattleSide, pub mint: Pubkey,
    pub owner: Pubkey, pub initial_price: u64,
}

#[event]
pub struct StreamDataUpdated {
    pub battle_id: u64, pub stream_count_a: u64, pub stream_count_b: u64,
    pub delta_a: u64, pub delta_b: u64, pub timestamp: i64,
}

#[event]
pub struct NftPriceAdapted {
    pub mint: Pubkey, pub old_price: u64, pub new_price: u64,
    pub stream_boost: u64, pub vote_multiplier_bps: u64,
}

#[event]
pub struct MetadataUriUpdated {
    pub mint: Pubkey, pub new_uri: String, pub battle_phase: BattlePhase,
}

#[event]
pub struct NftTraded {
    pub mint: Pubkey, pub battle_id: u64, pub seller: Pubkey, pub buyer: Pubkey,
    pub sale_price: u64, pub royalty_amount: u64, pub royalty_bps: u16,
    pub platform_fee: u64, pub seller_proceeds: u64,
}

#[event]
pub struct VoteCast {
    pub battle_id: u64, pub voter: Pubkey, pub side: BattleSide,
}

#[event]
pub struct BattleEnded {
    pub battle_id: u64, pub winner: BattleSide, pub score_a: u64, pub score_b: u64,
    pub stream_count_a: u64, pub stream_count_b: u64, pub votes_a: u64, pub votes_b: u64,
}

#[event]
pub struct WinnerBonusClaimed {
    pub mint: Pubkey, pub battle_id: u64, pub new_price: u64,
}

// ============================================================
// ERRORS
// ============================================================

#[error_code]
pub enum WaveWarzError {
    #[msg("Royalty must be between 1% and 10% (100–1000 bps)")]
    InvalidRoyaltyRange,
    #[msg("Battle end time must be after start time")]
    InvalidBattleTimes,
    #[msg("Battle is not active")]
    BattleNotActive,
    #[msg("Battle is still active, cannot end yet")]
    BattleStillActive,
    #[msg("Battle has already ended")]
    BattleAlreadyEnded,
    #[msg("Unauthorized oracle signer")]
    UnauthorizedOracle,
    #[msg("Price update cooldown still active")]
    UpdateCooldownActive,
    #[msg("Invalid price")]
    InvalidPrice,
    #[msg("Voter has already voted in this battle")]
    AlreadyVoted,
    #[msg("No winner declared yet")]
    NoWinner,
    #[msg("NFT is not on the winning side")]
    NotWinningSide,
    #[msg("Winner bonus already claimed")]
    BonusAlreadyClaimed,
}
