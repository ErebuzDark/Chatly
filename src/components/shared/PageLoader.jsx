import { Spin } from 'antd'

export default function PageLoader() {
  return (
    <div className="grid h-full min-h-dvh place-items-center">
      <Spin size="large" />
    </div>
  )
}
