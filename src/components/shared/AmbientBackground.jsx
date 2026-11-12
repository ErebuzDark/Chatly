// Flat blurred color blobs behind the glass surfaces (no gradients).
export default function AmbientBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -top-32 -left-24 size-96 rounded-full bg-primary/25 blur-3xl" />
      <div className="absolute -right-24 bottom-0 size-[28rem] rounded-full bg-secondary/20 blur-3xl" />
    </div>
  )
}
