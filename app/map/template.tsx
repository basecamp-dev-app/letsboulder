export default function MapTemplate({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-gray-900">
      {children}
    </div>
  )
}
