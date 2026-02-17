import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = {
  width: 32,
  height: 32,
};
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#1a1a2e',
        }}
      >
        <div style={{ fontSize: 24, fontWeight: 'bold', color: '#00d4ff' }}>W</div>
      </div>
    ),
    {
      ...size,
    }
  );
}
