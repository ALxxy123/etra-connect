'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, Lock, Loader2, Sparkles, Shield, User } from 'lucide-react'
import { supabase, isAllowedEmail } from '@/lib/supabase'

// منع الـ prerendering في البناء
export const dynamic = 'force-dynamic'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [checkingAuth, setCheckingAuth] = useState(true)

  useEffect(() => {
    // التحقق من وجود جلسة سابقة
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        router.push('/dashboard')
      }
      setCheckingAuth(false)
    }
    checkSession()
  }, [router])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    // التحقق من الإيميل المسموح
    if (!isAllowedEmail(email)) {
      setError('عذراً، هذا الحساب غير مصرح له بالدخول')
      setIsLoading(false)
      return
    }

    try {
      // ✅ تسجيل خروج أي جلسة سابقة أولاً لمنع تداخل الحسابات
      await supabase.auth.signOut()

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) throw error
      router.push('/dashboard')
    } catch (err: any) {
      setError(err.message === 'Invalid login credentials'
        ? 'بيانات الدخول غير صحيحة'
        : 'حدث خطأ أثناء تسجيل الدخول')
    } finally {
      setIsLoading(false)
    }
  }

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-dark)]">
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-[var(--color-bg-dark)]">
      {/* Background Ambience */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[100px] animate-float" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-violet-600/10 rounded-full blur-[100px] animate-float" style={{ animationDelay: '2s' }} />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-sm relative z-10"
      >
        {/* Branding */}
        <div className="text-center mb-10">
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-500 mb-6 shadow-glow"
          >
            <Sparkles className="w-8 h-8 text-white" />
          </motion.div>
          <h1 className="text-3xl font-bold text-white mb-2 font-cairo">ETRA Connect</h1>
          <p className="text-slate-400 text-sm">بوابة التواصل الآمنة للفريق</p>
        </div>

        {/* Login Card */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="glass-strong rounded-3xl p-8"
        >
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 mr-1">البريد الإلكتروني</label>
              <div className="relative">
                <Mail className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pr-12 pl-4 py-3.5 rounded-xl input-glass text-sm"
                  placeholder="name@etra.com"
                  dir="ltr"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 mr-1">كلمة المرور</label>
              <div className="relative">
                <Lock className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pr-12 pl-4 py-3.5 rounded-xl input-glass text-sm"
                  placeholder="••••••••"
                  dir="ltr"
                  required
                />
              </div>
            </div>

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-xs text-center"
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 rounded-xl btn-primary text-sm flex items-center justify-center gap-2 mt-2"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <span>تسجيل الدخول</span>
                  <Shield className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </motion.div>

        {/* Footer */}
        <p className="text-center text-slate-600 text-xs mt-8">
          جميع الحقوق محفوظة لفريق ETRA © 2025
        </p>
      </motion.div>
    </div>
  )
}
