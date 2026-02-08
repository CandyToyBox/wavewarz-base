'use client';

import { useState, useRef, useEffect } from 'react';
import clsx from 'clsx';

interface AudioPlayerProps {
  trackUrl: string;
  artistName: string;
  artistSide: 'A' | 'B';
  isWinner?: boolean;
}

export function AudioPlayer({
  trackUrl,
  artistName,
  artistSide,
  isWinner,
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const isArtistA = artistSide === 'A';

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      setIsLoading(false);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [trackUrl]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;

    const newTime = parseFloat(e.target.value);
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className={clsx(
        'audio-player p-4',
        isWinner && 'winner-highlight',
        isWinner === false && 'loser-highlight'
      )}
    >
      <audio ref={audioRef} src={trackUrl} preload="metadata" />

      {/* Header */}
      <div className="flex justify-between items-center mb-3">
        <div>
          <p className="text-ww-grey text-xs">
            {isArtistA ? 'Artist A' : 'Artist B'}
          </p>
          <h4
            className={clsx(
              'font-rajdhani text-lg font-bold',
              isArtistA ? 'text-wave-blue' : 'text-action-green'
            )}
          >
            {artistName}
          </h4>
        </div>
        {isWinner !== undefined && (
          <span
            className={clsx(
              'text-xs font-bold px-2 py-1 rounded',
              isWinner
                ? 'bg-action-green text-deep-space'
                : 'bg-ww-grey/30 text-ww-grey'
            )}
          >
            {isWinner ? 'WINNER' : 'LOSER'}
          </span>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4">
        <button
          onClick={togglePlay}
          disabled={isLoading}
          className={clsx(
            'w-12 h-12 rounded-full flex items-center justify-center transition-all',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            isArtistA
              ? 'bg-wave-blue hover:bg-wave-blue/80'
              : 'bg-action-green hover:bg-action-green/80'
          )}
        >
          {isLoading ? (
            <LoadingSpinner />
          ) : isPlaying ? (
            <PauseIcon />
          ) : (
            <PlayIcon />
          )}
        </button>

        <div className="flex-1">
          {/* Progress bar */}
          <div className="relative h-2 bg-deep-space/50 rounded-full overflow-hidden">
            <div
              className={clsx(
                'absolute h-full transition-all duration-100',
                isArtistA ? 'bg-wave-blue' : 'bg-action-green'
              )}
              style={{ width: `${progress}%` }}
            />
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </div>

          {/* Time */}
          <div className="flex justify-between mt-1 text-xs text-ww-grey">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg
      className="w-6 h-6 text-deep-space ml-1"
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg
      className="w-6 h-6 text-deep-space"
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
    </svg>
  );
}

function LoadingSpinner() {
  return (
    <svg
      className="w-5 h-5 text-deep-space animate-spin"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
