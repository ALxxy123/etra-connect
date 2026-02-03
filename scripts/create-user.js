// سكربت لإنشاء مستخدم في Supabase
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://nrspjkiapcxfnwzttkbf.supabase.co'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseServiceKey) {
    console.log('❌ يجب إضافة SUPABASE_SERVICE_ROLE_KEY')
    console.log('')
    console.log('📋 الخطوات:')
    console.log('1. اذهب إلى https://supabase.com/dashboard')
    console.log('2. افتح مشروعك')
    console.log('3. اذهب إلى Settings > API')
    console.log('4. انسخ "service_role" key (ليس anon)')
    console.log('5. شغّل الأمر: set SUPABASE_SERVICE_ROLE_KEY=المفتاح_هنا')
    console.log('6. ثم شغّل: node scripts/create-user.js')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
})

async function createUser() {
    const email = 'ahmdalnt98@gmail.com'
    const password = 'Aa050533@'

    console.log('🔄 جاري إنشاء المستخدم...')

    const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // تأكيد الإيميل تلقائياً
        user_metadata: {
            name: 'أحمد'
        }
    })

    if (error) {
        if (error.message.includes('already been registered')) {
            console.log('ℹ️ المستخدم موجود مسبقاً، جاري تحديث كلمة المرور...')

            // البحث عن المستخدم
            const { data: users } = await supabase.auth.admin.listUsers()
            const user = users.users.find(u => u.email === email)

            if (user) {
                const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
                    password,
                    email_confirm: true
                })

                if (updateError) {
                    console.log('❌ خطأ في التحديث:', updateError.message)
                } else {
                    console.log('✅ تم تحديث كلمة المرور بنجاح!')
                    console.log('📧 الإيميل:', email)
                    console.log('🔑 كلمة المرور:', password)
                }
            }
        } else {
            console.log('❌ خطأ:', error.message)
        }
    } else {
        console.log('✅ تم إنشاء المستخدم بنجاح!')
        console.log('📧 الإيميل:', email)
        console.log('🔑 كلمة المرور:', password)
        console.log('👤 ID:', data.user.id)
    }
}

createUser()
