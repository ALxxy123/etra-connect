-- ================================================
-- ETRA Connect - Supabase Database Setup
-- ================================================
-- قم بتشغيل هذا الملف في Supabase SQL Editor
-- ================================================

-- 1. جدول المستخدمين
-- ================================================
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- تفعيل RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- سياسات الأمان للمستخدمين
CREATE POLICY "Users can view all users" ON public.users
  FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- 2. جدول الرسائل
-- ================================================
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- فهرس للترتيب السريع
CREATE INDEX IF NOT EXISTS messages_created_at_idx ON public.messages(created_at);

-- تفعيل RLS
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- سياسات الأمان للرسائل
CREATE POLICY "Authenticated users can view messages" ON public.messages
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert messages" ON public.messages
  FOR INSERT WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Users can update own messages" ON public.messages
  FOR UPDATE USING (auth.uid() = sender_id);

-- 3. جدول الملاحظات
-- ================================================
CREATE TABLE IF NOT EXISTS public.notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assigned_to UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  is_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- فهرس للترتيب السريع
CREATE INDEX IF NOT EXISTS notes_created_at_idx ON public.notes(created_at);
CREATE INDEX IF NOT EXISTS notes_assigned_to_idx ON public.notes(assigned_to);

-- تفعيل RLS
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

-- سياسات الأمان للملاحظات
CREATE POLICY "Authenticated users can view notes" ON public.notes
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert notes" ON public.notes
  FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated users can update notes" ON public.notes
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Creators can delete notes" ON public.notes
  FOR DELETE USING (auth.uid() = created_by);

-- 4. Function لإنشاء مستخدم عند التسجيل
-- ================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger لإنشاء المستخدم تلقائياً
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. تفعيل Realtime للجداول
-- ================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notes;

-- ================================================
-- انتهى الإعداد!
-- ================================================
-- الخطوات التالية:
-- 1. اذهب إلى Authentication > URL Configuration
--    وأضف URL موقعك في Site URL و Redirect URLs
-- 2. اذهب إلى Authentication > Email Templates
--    وعدل القوالب حسب رغبتك (اختياري)
-- ================================================
