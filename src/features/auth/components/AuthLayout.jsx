import { Outlet } from 'react-router-dom'
import { MessageFilled } from '@ant-design/icons'
import { APP_NAME } from '@/lib/utils'
import AmbientBackground from '@/components/shared/AmbientBackground'

export default function AuthLayout() {
  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <AmbientBackground />
      <div className="glass w-full max-w-sm rounded-lg p-6 sm:p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid size-12 place-items-center rounded-lg bg-primary text-xl text-primary-foreground">
            <MessageFilled />
          </div>
          <h1 className="m-0 text-xl font-semibold">{APP_NAME}</h1>
        </div>
        <Outlet />
      </div>
    </div>
  )
}
