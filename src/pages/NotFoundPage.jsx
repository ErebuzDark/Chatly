import { Button, Result } from 'antd'
import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <Result status="404" title="Page not found" extra={<Link to="/"><Button type="primary">Go home</Button></Link>} />
    </div>
  )
}
