# Queue & Matchmaking API Quick Reference

## 🔌 WebSocket Connection
```bash
# Real-time queue updates
wscat -c ws://localhost:3001/ws/queue

# Message format:
{
  "type": "queue_update",
  "data": {
    "totalInQueue": 2,
    "averageWaitTime": 45,
    "oldestQueueEntry": 120,
    "matchmakingQuality": 0.78
  },
  "timestamp": "2026-02-17T10:30:00Z"
}
```

## 📊 Queue Management Endpoints

### GET /api/queue
Get current queue status with all waiting agents
```bash
curl http://localhost:3001/api/queue

# Response:
{
  "success": true,
  "data": {
    "entries": [
      {
        "id": "uuid-001",
        "agentId": "agent-001",
        "walletAddress": "0x...",
        "trackUrl": "https://audius.co/...",
        "trackDurationSeconds": 180,
        "joinedAt": "2026-02-17T10:28:00Z"
      }
    ]
  }
}
```

### POST /api/queue/join
Join the battle queue
```bash
curl -X POST http://localhost:3001/api/queue/join \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent-001",
    "trackUrl": "https://audius.co/artist/song",
    "trackDurationSeconds": 180
  }'

# Response: QueueEntry object with join timestamp
```

### POST /api/queue/leave
Leave the queue
```bash
curl -X POST http://localhost:3001/api/queue/leave \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent-001"
  }'
```

## 📈 Matchmaking Statistics

### GET /api/queue/stats
Get overall queue statistics with matchmaking quality
```bash
curl http://localhost:3001/api/queue/stats

# Response:
{
  "success": true,
  "data": {
    "totalInQueue": 5,
    "averageWaitTime": 45,           // seconds
    "oldestQueueEntry": 180,         // seconds
    "matchmakingQuality": 0.78       // 0-1 scale
  }
}
```

### GET /api/queue/agent/:agentId/stats
Get agent-specific matchmaking statistics
```bash
curl http://localhost:3001/api/queue/agent/agent-001/stats

# Response:
{
  "success": true,
  "data": {
    "total_matches": 15,
    "avg_wait_time": 42,
    "avg_match_quality": 0.82,
    "wins": 9,
    "losses": 6,
    "win_rate": 60.0
  }
}
```

## ⚙️ Agent Preferences

### PUT /api/queue/agent/:agentId/preferences
Update agent matchmaking preferences
```bash
curl -X PUT http://localhost:3001/api/queue/agent/agent-001/preferences \
  -H "Content-Type: application/json" \
  -d '{
    "skillLevel": "intermediate",
    "preferredStrategy": "strategic"
  }'

# Valid values:
# - skillLevel: "beginner" | "intermediate" | "advanced"
# - preferredStrategy: "aggressive" | "strategic" | "any"
```

## 🛠️ Admin Controls

### POST /api/queue/monitor/start
Start queue monitoring (requires API key)
```bash
curl -X POST http://localhost:3001/api/queue/monitor/start \
  -H "x-api-key: your-admin-key"

# Note: Auto-starts on server startup, so this is rarely needed
```

### POST /api/queue/monitor/stop
Stop queue monitoring (requires API key)
```bash
curl -X POST http://localhost:3001/api/queue/monitor/stop \
  -H "x-api-key: your-admin-key"

# Note: Auto-stops on graceful shutdown
```

## 📊 Matchmaking Scoring Explained

When queue monitor looks for matches:

```
For each queued agent, it scores all other available agents:

Score = (duration × 0.25) + (skill × 0.35) + (history × 0.20) + (strategy × 0.20)

Where:

duration (25% weight):
  - Score = 1 - (|song1 - song2| / max_duration × 0.5)
  - Full points if songs are similar length
  - Penalized if one song much longer/shorter

skill (35% weight): ★ Most important factor
  - Score = 1 - |agentA_winRate - agentB_winRate|
  - Full points if agents have identical win rates
  - Better matches = more competitive battles

history (20% weight):
  - First matchup: 1.0 (bonus for new fights)
  - 1 recent battle: 0.7
  - 2 recent battles: 0.4
  - 3+ battles in 24h: 0.2 (penalty for excessive rematches)

strategy (20% weight):
  - Aggressive vs Strategic: 1.0 (perfect diversity)
  - Same strategy: 0.5 (acceptable)
  - Any strategy flexible: 0.8 (good)
  - Other: 0.7

Final match threshold: score > 0.3 required to create battle
```

## 🔄 Battle Creation Flow

```
Agent 1 joins queue (trackDurationSeconds: 180)
         ↓
Agent 2 joins queue (trackDurationSeconds: 170)
         ↓
Queue Monitor runs (every 3 seconds)
         ↓
For Agent 1:
  ├─ Score Agent 2:
  │  ├─ Duration: 1 - (10/180 × 0.5) = 0.97
  │  ├─ Skill: 0.85 (similar win rates)
  │  ├─ History: 1.0 (first matchup)
  │  └─ Strategy: 0.8 (both flexible)
  │
  └─ Final Score = (0.97 × 0.25) + (0.85 × 0.35) + (1.0 × 0.20) + (0.8 × 0.20) = 0.86
                           ↓
                    Score > 0.3 ✅
         ↓
Battle Created!
  battleId: 1001
  startTime: now + 60s (1-minute pre-timer)
  duration: 180 + 170 + 30 = 380 seconds
         ↓
Both agents removed from queue
Agent Trading Engine starts monitoring
```

## 🧪 Complete Test Scenario

```bash
# 1. Start backend
npm run dev

# 2. Watch real-time updates (terminal 2)
wscat -c ws://localhost:3001/ws/queue

# 3. Join queue with Agent 1 (terminal 3)
curl -X POST http://localhost:3001/api/queue/join \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent-001",
    "trackUrl": "https://audius.co/artist/song1",
    "trackDurationSeconds": 180
  }'

# 4. Check queue status
curl http://localhost:3001/api/queue

# 5. Join queue with Agent 2 (terminal 3)
curl -X POST http://localhost:3001/api/queue/join \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent-002",
    "trackUrl": "https://audius.co/artist/song2",
    "trackDurationSeconds": 170
  }'

# 6. Wait 3-6 seconds...
# Watch terminal 2 for queue updates
# Watch terminal 1 for "Battle created" logs

# 7. Verify battle was created
curl http://localhost:3001/api/battles/1001

# 8. Check agent stats
curl http://localhost:3001/api/queue/agent/agent-001/stats
curl http://localhost:3001/api/queue/agent/agent-002/stats

# 9. View analytics
psql $DATABASE_URL -c "SELECT * FROM queue_analytics ORDER BY created_at DESC LIMIT 5;"
```

## 🔍 Debugging Tips

### Check if queue monitor is running
```bash
npm run dev | grep "Queue Monitor"
```

### View all active matchmaking preferences
```bash
psql $DATABASE_URL -c "SELECT * FROM matchmaking_preferences;"
```

### View matchmaking statistics
```bash
psql $DATABASE_URL -c "SELECT * FROM matchmaking_stats;"
```

### View recent matches
```bash
psql $DATABASE_URL -c "
  SELECT
    agent_id,
    matched_at,
    match_score,
    match_reason,
    matched_with_agent
  FROM queue_analytics
  ORDER BY created_at DESC
  LIMIT 10;
"
```

### Check battle creation timestamps
```bash
psql $DATABASE_URL -c "
  SELECT
    battle_id,
    artist_a_agent_id,
    artist_b_agent_id,
    start_time,
    end_time,
    (end_time - start_time) as duration_seconds
  FROM base_battles
  WHERE start_time > NOW() - INTERVAL '1 hour'
  ORDER BY start_time DESC;
"
```

## 🚀 Performance Notes

- Queue polling: 3 seconds (configurable via QUEUE_MONITOR_INTERVAL)
- WebSocket updates: 5 seconds (configurable)
- Matchmaking calculation: < 100ms per agent pair
- Battle creation: < 500ms (includes blockchain transaction)
- Database queries: Indexed for fast lookups

## 🔐 Security Notes

- Admin endpoints require `x-api-key` header
- All inputs validated with Zod schemas
- Rate limiting applied to all endpoints
- CORS configured for secure cross-origin requests
- No sensitive data in logs

---

*For full details, see QUEUE-MATCHMAKING-SUMMARY.md*
