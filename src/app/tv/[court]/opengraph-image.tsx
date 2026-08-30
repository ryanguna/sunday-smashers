import { ImageResponse } from 'next/og'
import { getCourtSnapshot } from '@/lib/tv/data'

export const alt = 'Sunday Smashers — Courtside TV'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ court: string }> }) {
  const { court } = await params
  const snapshot = await getCourtSnapshot(court)
  const live = snapshot.live

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #1c0f2e 0%, #2a1745 50%, #4a1f3d 100%)',
          color: '#fbfbff',
          fontSize: 48,
          fontWeight: 700,
        }}
      >
        <div style={{ fontSize: 32, opacity: 0.7, marginBottom: 16 }}>
          Sunday Smashers · Courtside TV
        </div>
        <div style={{ fontSize: 56, marginBottom: 24 }}>{snapshot.courtLabel}</div>
        {live ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, fontSize: 64, color: '#ffc861' }}>
            <span>{live.teamA.name}</span>
            <span>
              {live.pointsA}–{live.pointsB}
            </span>
            <span>{live.teamB.name}</span>
          </div>
        ) : (
          <div style={{ fontSize: 36, opacity: 0.6 }}>No match in progress</div>
        )}
      </div>
    ),
    { ...size },
  )
}
