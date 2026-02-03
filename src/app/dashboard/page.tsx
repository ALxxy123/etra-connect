'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MessageCircle,
  CheckSquare,
  LogOut,
  Send,
  Plus,
  Bell,
  BellOff,
  Loader2,
  Phone,
  Check,
  Trash2,
  X,
  User,
  Mic,
  Square,
  Play,
  Pause,
  Paperclip,
  Image as ImageIcon,
  FileText,
  Download
} from 'lucide-react'
import { supabase, getUserName, getOtherUserName } from '@/lib/supabase'
import { requestNotificationPermission, showNotification, playNotificationSound } from '@/lib/notifications'
import type { Message, Note, TabType, User as UserType } from '@/types'
import { format } from 'date-fns'
import { ar } from 'date-fns/locale'

// منع الـ prerendering في البناء
export const dynamic = 'force-dynamic'

export default function DashboardPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabType>('chat')
  const [user, setUser] = useState<UserType | null>(null)
  const [otherUser, setOtherUser] = useState<UserType | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [showNoteModal, setShowNoteModal] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [isOtherUserOnline, setIsOtherUserOnline] = useState(false)

  // Voice Recording State
  const [isRecording, setIsRecording] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null)

  // File Upload State
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)

  // New Note Form State
  const [noteForm, setNoteForm] = useState({
    title: '',
    content: '',
    assignedToMe: true,
    priority: 'medium' as 'low' | 'medium' | 'high'
  })

  const otherUserNameDisplay = user ? getOtherUserName(user.email) : 'الطرف الآخر';

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/')
        return
      }

      const currentUser: UserType = {
        id: session.user.id,
        email: session.user.email!,
        name: getUserName(session.user.email!),
        created_at: session.user.created_at
      }
      setUser(currentUser)

      const { data: users } = await supabase
        .from('users')
        .select('*')
        .neq('id', session.user.id)
        .single()

      if (users) {
        setOtherUser(users)
      }

      await fetchMessages()
      await fetchNotes()
      const hasPermission = await requestNotificationPermission()
      setNotificationsEnabled(hasPermission)
      setIsLoading(false)
    }
    init()
  }, [router])

  useEffect(() => {
    if (!user) return

    const messagesChannel = supabase
      .channel('messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const newMsg = payload.new as Message
        setMessages(prev => [...prev, newMsg])
        if (newMsg.sender_id !== user.id && notificationsEnabled) {
          const isVoiceMsg = newMsg.content.startsWith('[VOICE:')
          showNotification({
            title: 'رسالة جديدة',
            body: isVoiceMsg ? '🎤 رسالة صوتية' : newMsg.content.substring(0, 50),
            data: { type: 'message', id: newMsg.id }
          })
          playNotificationSound()
        }
        setTimeout(scrollToBottom, 100)
      })
      // ✅ الاستماع لحدث حذف الرسائل - ينحذف من الطرفين
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload) => {
        const deletedMsg = payload.old as { id: string }
        setMessages(prev => prev.filter(m => m.id !== deletedMsg.id))
      })
      .subscribe()

    const notesChannel = supabase
      .channel('notes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notes' }, async (payload) => {
        const newNote = payload.new as Note
        if (newNote.assigned_to === user.id && newNote.created_by !== user.id && notificationsEnabled) {
          showNotification({
            title: 'ملاحظة جديدة لك 📝',
            body: newNote.title.substring(0, 50),
            data: { type: 'note', id: newNote.id }
          })
          playNotificationSound()
        }
        await fetchNotes()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notes' }, async () => {
        await fetchNotes()
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'notes' }, async () => {
        await fetchNotes()
      })
      .subscribe()

    const presenceChannel = supabase.channel('presence_room')
    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const newState = presenceChannel.presenceState()
        const otherUsers = Object.keys(newState).filter(key => key !== user.id)
        setIsOtherUserOnline(otherUsers.length > 0)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({
            user_id: user.id,
            online_at: new Date().toISOString(),
          })
        }
      })

    return () => {
      messagesChannel.unsubscribe()
      notesChannel.unsubscribe()
      presenceChannel.unsubscribe()
    }
  }, [user, notificationsEnabled, scrollToBottom])

  useEffect(() => {
    if (messages.length > 0) scrollToBottom()
  }, [messages, scrollToBottom])

  const fetchMessages = async () => {
    const { data } = await supabase.from('messages').select('*').order('created_at', { ascending: true })
    if (data) {
      setMessages(data)
      const unread = data.filter(m => !m.is_read && m.sender_id !== user?.id).length
      setUnreadCount(unread)
    }
  }

  const fetchNotes = async () => {
    const { data } = await supabase.from('notes').select('*').order('created_at', { ascending: false })
    if (data) setNotes(data)
  }

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || !user || isSending) return
    setIsSending(true)
    const content = newMessage.trim()
    setNewMessage('')
    const { error } = await supabase.from('messages').insert({
      sender_id: user.id,
      content,
      message_type: 'text',
      is_read: false
    })
    if (error) {
      setNewMessage(content)
      console.error('Error sending message:', error)
    }
    setIsSending(false)
  }

  // Voice Recording Functions
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        stream.getTracks().forEach(track => track.stop())
        await sendVoiceMessage(audioBlob)
      }

      mediaRecorder.start()
      setIsRecording(true)
      setRecordingDuration(0)

      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1)
      }, 1000)
    } catch (error) {
      console.error('Error starting recording:', error)
      alert('لا يمكن الوصول للميكروفون')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current)
      }
    }
  }

  const sendVoiceMessage = async (audioBlob: Blob) => {
    if (!user) return
    setIsSending(true)

    try {
      // تحويل الصوت إلى Base64 وتخزينه في حقل content مباشرة
      const reader = new FileReader()
      reader.onloadend = async () => {
        const base64Audio = reader.result as string
        // تخزين الصوت بتنسيق خاص: [VOICE:duration:base64data]
        const voiceContent = `[VOICE:${recordingDuration}:${base64Audio}]`

        const { error } = await supabase.from('messages').insert({
          sender_id: user.id,
          content: voiceContent,
          is_read: false
        })

        if (error) {
          console.error('Error sending voice message:', error)
          alert('حدث خطأ في إرسال الرسالة الصوتية')
        }

        setIsSending(false)
        setRecordingDuration(0)
      }
      reader.readAsDataURL(audioBlob)
    } catch (error) {
      console.error('Error sending voice message:', error)
      setIsSending(false)
    }
  }

  // رفع صورة أو ملف
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return

    // التحقق من حجم الملف (max 5MB)
    const maxSize = 5 * 1024 * 1024
    if (file.size > maxSize) {
      alert('حجم الملف كبير جداً! الحد الأقصى 5MB')
      return
    }

    setIsUploading(true)

    try {
      const reader = new FileReader()
      reader.onloadend = async () => {
        const base64 = reader.result as string
        const isImage = file.type.startsWith('image/')

        // تنسيق خاص للصور والملفات
        let messageContent: string
        if (isImage) {
          messageContent = `[IMAGE:${base64}]`
        } else {
          messageContent = `[FILE:${file.name}:${base64}]`
        }

        const { error } = await supabase.from('messages').insert({
          sender_id: user.id,
          content: messageContent,
          is_read: false
        })

        if (error) {
          console.error('Upload error:', error)
          alert('فشل رفع الملف')
        }

        setIsUploading(false)
      }
      reader.readAsDataURL(file)
    } catch (error) {
      console.error('File upload error:', error)
      setIsUploading(false)
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const createNote = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!noteForm.title.trim() || !user) return
    const assignedTo = noteForm.assignedToMe ? user.id : otherUser?.id

    await supabase.from('notes').insert({
      created_by: user.id,
      assigned_to: assignedTo,
      title: noteForm.title.trim(),
      content: noteForm.content.trim() || null,
      priority: noteForm.priority,
      is_completed: false
    })

    setNoteForm({ title: '', content: '', assignedToMe: true, priority: 'medium' })
    setShowNoteModal(false)
  }

  const toggleNoteComplete = async (noteId: string, currentStatus: boolean) => {
    await supabase.from('notes').update({ is_completed: !currentStatus }).eq('id', noteId)
  }

  const deleteNote = async (noteId: string) => {
    await supabase.from('notes').delete().eq('id', noteId)
  }

  // حذف رسالة معينة
  const deleteMessage = async (messageId: string) => {
    if (!confirm('حذف هذه الرسالة؟')) return

    try {
      const { error } = await supabase.from('messages').delete().eq('id', messageId)
      if (error) {
        console.error('Delete error:', error)
        alert('فشل حذف الرسالة: ' + error.message)
      } else {
        // حذف من الـ state محلياً
        setMessages(prev => prev.filter(m => m.id !== messageId))
      }
    } catch (err) {
      console.error('Delete error:', err)
      alert('حدث خطأ أثناء الحذف')
    }
  }

  // حذف كل المحادثة
  const clearAllMessages = async () => {
    if (!confirm('هل أنت متأكد من حذف كل المحادثة؟ لا يمكن التراجع!')) return

    try {
      // حذف كل الرسائل باستخدام filter صحيح
      const { error } = await supabase.from('messages').delete().gte('id', '00000000-0000-0000-0000-000000000000')
      if (error) {
        console.error('Clear all error:', error)
        alert('فشل حذف المحادثة: ' + error.message)
      } else {
        setMessages([])
      }
    } catch (err) {
      console.error('Clear all error:', err)
      alert('حدث خطأ أثناء الحذف')
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const formatMessageTime = (date: string) => {
    const d = new Date(date)
    return format(d, 'h:mm a', { locale: ar })
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f172a]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <p className="text-slate-400 font-medium">جاري التحميل...</p>
        </div>
      </div>
    )
  }

  const myNotes = notes.filter(n => n.assigned_to === user?.id)
  const theirNotes = notes.filter(n => n.assigned_to !== user?.id)

  return (
    <div className="min-h-screen flex flex-col bg-[#0f172a] text-slate-100 font-cairo safe-top safe-bottom">

      {/* 1. Header */}
      <header className="px-4 pt-4 sticky top-0 z-50 bg-[#0f172a]">
        <div className="bg-[#1e293b]/80 backdrop-blur-xl border border-white/5 rounded-2xl p-3 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg hover:scale-105 transition-transform">
                  <span className="text-white font-bold text-xl">{otherUserNameDisplay.charAt(0)}</span>
                </div>
                <div
                  className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-[3px] border-[#1e293b] flex items-center justify-center 
                       ${isOtherUserOnline ? 'bg-emerald-500' : 'bg-slate-500'}`}
                >
                  {isOtherUserOnline && <span className="w-full h-full rounded-full bg-emerald-400/50 animate-ping absolute" />}
                </div>
              </div>

              <div>
                <h1 className="font-bold text-base text-white">{otherUserNameDisplay}</h1>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${isOtherUserOnline ? 'bg-emerald-500' : 'bg-slate-500'}`} />
                  <p className="text-xs text-slate-400">{isOtherUserOnline ? 'متصل الآن' : 'آخر ظهور قريباً'}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button onClick={() => setNotificationsEnabled(!notificationsEnabled)}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${notificationsEnabled ? 'bg-blue-500/10 text-blue-400' : 'text-slate-400 hover:bg-slate-700/50'}`}>
                {notificationsEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
              </button>
              <button onClick={clearAllMessages} className="w-9 h-9 rounded-full text-slate-400 hover:bg-slate-700/50 hover:text-amber-400 flex items-center justify-center transition-all" title="حذف المحادثة">
                <Trash2 className="w-4 h-4" />
              </button>
              <button onClick={handleLogout} className="w-9 h-9 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center hover:bg-red-500/20 transition-all ml-1">
                <LogOut className="w-4 h-4 ltr:rotate-180" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* 2. Tabs */}
      <div className="px-16 py-4 sticky top-[80px] z-40">
        <div className="flex bg-[#1e293b] p-1 rounded-2xl shadow-lg border border-white/5 mx-auto max-w-[280px]">
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${activeTab === 'chat' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}
          >
            المحادثة
            {unreadCount > 0 && activeTab !== 'chat' && (
              <span className="bg-red-500 text-white text-[9px] min-w-[16px] h-4 rounded-full flex items-center justify-center">{unreadCount}</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('notes')}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${activeTab === 'notes' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}
          >
            الملاحظات
          </button>
        </div>
      </div>

      {/* 3. Main Content */}
      <main className="flex-1 overflow-hidden relative w-full max-w-2xl mx-auto rounded-t-[32px] md:rounded-[32px] bg-[#0f172a]">
        <AnimatePresence mode="wait" initial={false}>
          {activeTab === 'chat' ? (
            <motion.div
              key="chat"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="h-full flex flex-col"
            >
              <div
                ref={chatContainerRef}
                className="flex-1 overflow-y-auto px-4 py-6 space-y-4"
                style={{ backgroundImage: 'radial-gradient(circle at center, rgba(30, 41, 59, 0.5) 2px, transparent 2px)', backgroundSize: '24px 24px' }}
              >
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center opacity-60">
                    <MessageCircle className="w-16 h-16 text-slate-700 mb-4" />
                    <p className="text-slate-500 text-sm">لا توجد رسائل</p>
                  </div>
                ) : (
                  messages.map((message, index) => {
                    const isMine = message.sender_id === user?.id
                    const isNextSame = messages[index + 1]?.sender_id === message.sender_id

                    // تحقق من نوع الرسالة
                    const voiceMatch = message.content.match(/^\[VOICE:(\d+):(.+)\]$/)
                    const imageMatch = message.content.match(/^\[IMAGE:(.+)\]$/)
                    const fileMatch = message.content.match(/^\[FILE:(.+?):(.+)\]$/)

                    const isVoice = !!voiceMatch
                    const isImage = !!imageMatch
                    const isFile = !!fileMatch

                    const voiceDuration = voiceMatch ? parseInt(voiceMatch[1]) : 0
                    const voiceUrl = voiceMatch ? voiceMatch[2] : ''
                    const imageUrl = imageMatch ? imageMatch[1] : ''
                    const fileName = fileMatch ? fileMatch[1] : ''
                    const fileUrl = fileMatch ? fileMatch[2] : ''

                    return (
                      <motion.div
                        key={message.id}
                        initial={{ opacity: 0, y: 10, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        className={`flex ${isMine ? 'justify-end' : 'justify-start'} ${isNextSame ? 'mb-1' : 'mb-4'} group/msg`}
                      >
                        {/* Delete button - يظهر قبل الرسالة إذا كانت لي */}
                        {isMine && (
                          <button
                            onClick={() => deleteMessage(message.id)}
                            className="opacity-0 group-hover/msg:opacity-100 self-center mr-2 w-7 h-7 rounded-full bg-red-500/10 text-red-400 hover:bg-red-500/20 flex items-center justify-center transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}

                        <div
                          className={`max-w-[80%] ${isImage ? 'p-2' : 'px-5 py-3'} text-[14px] leading-relaxed shadow-sm relative
                                ${isMine
                              ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-[24px] rounded-tr-sm'
                              : 'bg-[#1e293b] text-slate-100 rounded-[24px] rounded-tl-sm border border-slate-700/50'
                            }`}
                        >
                          {isVoice ? (
                            <VoicePlayer audioUrl={voiceUrl} duration={voiceDuration} isMine={isMine} />
                          ) : isImage ? (
                            <div>
                              <img
                                src={imageUrl}
                                alt="صورة"
                                className="rounded-xl max-w-full max-h-[300px] object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                onClick={() => window.open(imageUrl, '_blank')}
                              />
                            </div>
                          ) : isFile ? (
                            <a
                              href={fileUrl}
                              download={fileName}
                              className={`flex items-center gap-3 ${isMine ? 'text-white' : 'text-slate-100'} hover:opacity-80 transition-opacity`}
                            >
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isMine ? 'bg-white/20' : 'bg-blue-500/20'}`}>
                                <FileText className="w-5 h-5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{fileName}</p>
                                <p className={`text-xs ${isMine ? 'text-blue-200' : 'text-slate-400'}`}>اضغط للتحميل</p>
                              </div>
                              <Download className="w-4 h-4 opacity-60" />
                            </a>
                          ) : (
                            message.content
                          )}
                          <span className={`text-[9px] block mt-1 opacity-60 ${isMine ? 'text-blue-100/90 text-left' : 'text-slate-400 text-right'}`}>
                            {formatMessageTime(message.created_at)}
                          </span>
                        </div>

                        {/* Delete button - يظهر بعد الرسالة إذا كانت للآخر */}
                        {!isMine && (
                          <button
                            onClick={() => deleteMessage(message.id)}
                            className="opacity-0 group-hover/msg:opacity-100 self-center ml-2 w-7 h-7 rounded-full bg-red-500/10 text-red-400 hover:bg-red-500/20 flex items-center justify-center transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </motion.div>
                    )
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area with Voice */}
              <div className="p-4 bg-[#0f172a]/90 backdrop-blur-lg border-t border-white/5 safe-bottom">
                {isRecording ? (
                  <div className="flex items-center justify-between bg-red-500/20 p-3 rounded-[28px] border border-red-500/30">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                      <span className="text-red-400 font-bold text-sm">جاري التسجيل... {formatDuration(recordingDuration)}</span>
                    </div>
                    <button
                      onClick={stopRecording}
                      className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center text-white hover:bg-red-600 transition-all"
                    >
                      <Square className="w-5 h-5 fill-current" />
                    </button>
                  </div>
                ) : (
                  <form onSubmit={sendMessage} className="flex gap-2 items-center bg-[#1e293b] p-1.5 rounded-[28px] border border-slate-700/50 shadow-lg">
                    {/* Hidden File Input */}
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
                      className="hidden"
                    />

                    {/* Attachment Button */}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading || isSending}
                      className="w-[42px] h-[42px] rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-600/50 transition-all"
                    >
                      {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
                    </button>

                    <input
                      type="text"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder="اكتب رسالة..."
                      className="flex-1 bg-transparent border-none text-white text-sm px-3 py-3 focus:ring-0 placeholder:text-slate-500"
                      disabled={isSending}
                    />

                    {/* Voice Button - يظهر إذا لم يكن هناك نص */}
                    {!newMessage.trim() && (
                      <button
                        type="button"
                        onClick={startRecording}
                        disabled={isSending || isUploading}
                        className="w-[46px] h-[46px] rounded-full flex items-center justify-center bg-indigo-600 text-white hover:bg-indigo-500 transition-all"
                      >
                        <Mic className="w-5 h-5" />
                      </button>
                    )}

                    {/* Send Button - يظهر إذا كان هناك نص */}
                    {newMessage.trim() && (
                      <button
                        type="submit"
                        disabled={isSending}
                        className="w-[46px] h-[46px] rounded-full flex items-center justify-center bg-blue-600 text-white shadow-lg shadow-blue-600/20 hover:scale-105 transition-all"
                      >
                        {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 ltr:rotate-180" />}
                      </button>
                    )}
                  </form>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="notes"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="h-full overflow-y-auto p-4 pb-24"
            >
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#1e293b] p-4 rounded-2xl border border-white/5">
                    <span className="text-xs text-slate-400">ملاحظات {user?.name}</span>
                    <h3 className="text-2xl font-bold text-white mt-1">{myNotes.filter(n => !n.is_completed).length}</h3>
                  </div>
                  <div className="bg-[#1e293b] p-4 rounded-2xl border border-white/5">
                    <span className="text-xs text-slate-400">ملاحظات {otherUserNameDisplay}</span>
                    <h3 className="text-2xl font-bold text-white mt-1">{theirNotes.filter(n => !n.is_completed).length}</h3>
                  </div>
                </div>

                <div className="space-y-3">
                  <h2 className="text-sm font-bold text-white px-2">ملاحظات {user?.name}</h2>
                  {myNotes.length === 0 ? <p className="text-slate-500 text-xs px-2">لا توجد ملاحظات</p> : myNotes.map(note => <NoteCard key={note.id} note={note} currentUserId={user?.id || ''} onToggle={toggleNoteComplete} onDelete={deleteNote} />)}
                </div>

                <div className="space-y-3">
                  <h2 className="text-sm font-bold text-white px-2">ملاحظات {otherUserNameDisplay}</h2>
                  {theirNotes.length === 0 ? <p className="text-slate-500 text-xs px-2">لا توجد ملاحظات</p> : theirNotes.map(note => <NoteCard key={note.id} note={note} currentUserId={user?.id || ''} onToggle={toggleNoteComplete} onDelete={deleteNote} />)}
                </div>
              </div>

              <button onClick={() => setShowNoteModal(true)} className="fixed bottom-6 left-6 w-14 h-14 bg-blue-600 rounded-[22px] text-white shadow-xl shadow-blue-600/30 flex items-center justify-center hover:bg-blue-500 transition-all z-40 border-4 border-[#0f172a]">
                <Plus className="w-7 h-7" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Note Modal */}
      <AnimatePresence>
        {showNoteModal && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50" onClick={() => setShowNoteModal(false)} />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} className="fixed bottom-0 left-0 right-0 bg-[#1e293b] rounded-t-[32px] p-6 z-50 border-t border-white/10 safe-bottom md:max-w-lg md:mx-auto">
              <div className="w-12 h-1 bg-slate-600/50 rounded-full mx-auto mb-8" />
              <h3 className="text-xl font-bold text-white mb-6">إضافة ملاحظة</h3>
              <form onSubmit={createNote} className="space-y-4">
                <input type="text" value={noteForm.title} onChange={(e) => setNoteForm({ ...noteForm, title: e.target.value })} placeholder="اكتب الملاحظة..." className="w-full bg-[#0f172a] border-none rounded-2xl px-5 py-4 text-white focus:ring-2 focus:ring-blue-500" autoFocus />
                <div className="flex gap-2">
                  <button type="button" onClick={() => setNoteForm({ ...noteForm, assignedToMe: true })} className={`flex-1 py-3 rounded-xl font-bold text-xs transition-all ${noteForm.assignedToMe ? 'bg-blue-600 text-white' : 'bg-[#0f172a] text-slate-400'}`}>لـ {user?.name}</button>
                  <button type="button" onClick={() => setNoteForm({ ...noteForm, assignedToMe: false })} className={`flex-1 py-3 rounded-xl font-bold text-xs transition-all ${!noteForm.assignedToMe ? 'bg-indigo-600 text-white' : 'bg-[#0f172a] text-slate-400'}`}>لـ {otherUserNameDisplay}</button>
                </div>
                <div className="flex gap-2">
                  {(['low', 'medium', 'high'] as const).map(p => (
                    <button key={p} type="button" onClick={() => setNoteForm({ ...noteForm, priority: p })} className={`flex-1 py-3 rounded-xl font-bold text-[10px] transition-all ${noteForm.priority === p ? 'bg-[#0f172a] text-white border border-blue-500' : 'bg-[#0f172a] text-slate-500'}`}>
                      {p === 'high' ? 'عالية' : p === 'medium' ? 'متوسطة' : 'عادية'}
                    </button>
                  ))}
                </div>
                <button type="submit" className="w-full py-4 rounded-2xl bg-blue-600 text-white font-bold hover:bg-blue-500 active:scale-95 transition-all mt-2">حفظ</button>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

// Voice Player Component
function VoicePlayer({ audioUrl, duration, isMine }: { audioUrl?: string, duration?: number, isMine: boolean }) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (audioUrl) {
      audioRef.current = new Audio(audioUrl)
      audioRef.current.onended = () => setIsPlaying(false)
      audioRef.current.ontimeupdate = () => {
        if (audioRef.current) setCurrentTime(Math.floor(audioRef.current.currentTime))
      }
    }
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [audioUrl])

  const togglePlay = () => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="flex items-center gap-3 min-w-[180px]">
      <button onClick={togglePlay} className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${isMine ? 'bg-white/20 hover:bg-white/30' : 'bg-blue-500/20 hover:bg-blue-500/30'}`}>
        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>
      <div className="flex-1">
        <div className={`h-1 rounded-full ${isMine ? 'bg-white/30' : 'bg-slate-600'}`}>
          <div
            className={`h-full rounded-full transition-all ${isMine ? 'bg-white' : 'bg-blue-500'}`}
            style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
          />
        </div>
        <span className={`text-[10px] mt-1 block ${isMine ? 'text-white/70' : 'text-slate-400'}`}>
          {isPlaying ? formatTime(currentTime) : formatTime(duration || 0)}
        </span>
      </div>
    </div>
  )
}

function NoteCard({ note, currentUserId, onToggle, onDelete }: { note: Note, currentUserId: string, onToggle: Function, onDelete: Function }) {
  const isCreator = note.created_by === currentUserId
  const priorityColor = note.priority === 'high' ? 'bg-red-500' : note.priority === 'medium' ? 'bg-amber-500' : 'bg-emerald-500';

  return (
    <motion.div
      layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className={`relative bg-[#1e293b] rounded-[22px] p-5 border border-white/5 shadow-sm hover:border-slate-600 transition-colors ${note.is_completed ? 'opacity-50' : ''}`}
    >
      <div className="flex gap-4 items-start">
        <button
          onClick={() => onToggle(note.id, note.is_completed)}
          className={`w-6 h-6 rounded-lg border-[2px] flex items-center justify-center transition-all mt-1 ${note.is_completed ? 'bg-blue-500 border-blue-500' : 'border-slate-500 hover:border-blue-400'}`}
        >
          {note.is_completed && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
        </button>
        <div className="flex-1">
          <div className="flex justify-between items-start">
            <h4 className={`text-sm font-bold text-white leading-snug ${note.is_completed ? 'line-through text-slate-500 decoration-2' : ''}`}>{note.title}</h4>
            {isCreator && (
              <button onClick={() => onDelete(note.id)} className="text-slate-600 hover:text-red-400 p-2 -mt-2 -ml-2 rounded-full hover:bg-white/5 transition-all">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
          {note.content && <p className="text-xs text-slate-400 mt-2 line-clamp-2 leading-relaxed">{note.content}</p>}
          <div className="flex items-center gap-2 mt-3">
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#0f172a] text-slate-300 border border-white/5 flex items-center gap-1.5`}>
              <span className={`w-1.5 h-1.5 rounded-full ${priorityColor}`} />
              {note.priority === 'high' ? 'عالية' : note.priority === 'medium' ? 'متوسطة' : 'عادية'}
            </span>
            <span className="text-[10px] text-slate-500">{format(new Date(note.created_at), 'd MMM', { locale: ar })}</span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
