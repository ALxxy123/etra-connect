import { NotificationPayload } from '@/types'

export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!('Notification' in window)) {
    console.log('This browser does not support notifications')
    return false
  }

  if (Notification.permission === 'granted') {
    return true
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission()
    return permission === 'granted'
  }

  return false
}

export const showNotification = (payload: NotificationPayload) => {
  if (Notification.permission === 'granted') {
    const notification = new Notification(payload.title, {
      body: payload.body,
      icon: payload.icon || '/icon-192.png',
      badge: '/icon-192.png',
      tag: payload.data?.id || 'etra-connect',
    })

    notification.onclick = () => {
      window.focus()
      notification.close()
    }

    // إغلاق تلقائي بعد 5 ثواني
    setTimeout(() => notification.close(), 5000)
  }
}

export const playNotificationSound = () => {
  const audio = new Audio('/notification.mp3')
  audio.volume = 0.5
  audio.play().catch(() => {
    // تجاهل الخطأ إذا لم يكن هناك تفاعل من المستخدم
  })
}
