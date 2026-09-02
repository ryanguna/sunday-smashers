import { LoadingScreen } from '@/components/ui'

/**
 * The landing page reads the published tournament row, so its first paint
 * waits on the server. Without this the router sits on the previous page for
 * a beat after every click on the logo — which reads as "the nav is stuck".
 */
export default function HomeLoading() {
  return (
    <LoadingScreen
      title="Hanging the tinsel…"
      detail="Warming up the shuttles and fetching the countdown. 🎄"
    />
  )
}
