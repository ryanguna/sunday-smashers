import { LoadingScreen } from '@/components/ui'

export default function PayLoading() {
  return (
    <LoadingScreen
      title="Counting the tin…"
      detail="Fetching the entry fee and payment details. 💸"
    />
  )
}
