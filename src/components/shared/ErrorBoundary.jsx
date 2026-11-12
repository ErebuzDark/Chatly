import { Button, Result } from 'antd'
import { useRouteError } from 'react-router-dom'

export default function ErrorBoundary() {
  const error = useRouteError()
  console.error(error)
  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <Result
        status="error"
        title="Something went wrong"
        subTitle="An unexpected error occurred. Try reloading the page."
        extra={<Button type="primary" onClick={() => window.location.assign('/')}>Reload</Button>}
      />
    </div>
  )
}
