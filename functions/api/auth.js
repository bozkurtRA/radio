// Cloudflare Pages Serverless Edge Function: /api/auth
export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const { action, email, password } = body;
    const username = (email || '').trim().toLowerCase();

    if (!username) {
      return new Response(JSON.stringify({ success: false, message: 'Geçerli bir kullanıcı adı girin.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Secure server-side admin credentials check (Never exposed to client)
    const adminPassword = context.env.ADMIN_PASSWORD || 'admin';
    if (username === 'admin') {
      if (password === adminPassword) {
        return new Response(JSON.stringify({
          success: true,
          status: 'approved',
          role: 'admin',
          isAdmin: true,
          email: username,
          message: 'Yönetici girişi başarılı!'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } else {
        return new Response(JSON.stringify({ success: false, message: 'Hatalı yönetici şifresi!' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Cloudflare KV Persistent Storage Support (if bound in Cloudflare Dashboard)
    if (context.env.RADIO_KV) {
      const userData = await context.env.RADIO_KV.get(`user:${username}`, 'json');
      if (action === 'login') {
        if (!userData) {
          return new Response(JSON.stringify({ success: false, message: 'Kayıt bulunamadı. Lütfen erişim talebi gönderin.' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        if (userData.status === 'pending') {
          return new Response(JSON.stringify({ success: false, status: 'pending', message: 'Hesabınız henüz onaylanmadı. Yönetici onayı bekleniyor.' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        if (userData.status === 'rejected') {
          return new Response(JSON.stringify({ success: false, status: 'rejected', message: 'Hesap erişiminiz yönetici tarafından durdurulmuştur.' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        return new Response(JSON.stringify({
          success: true,
          status: 'approved',
          role: 'user',
          email: username,
          message: 'Giriş başarılı!'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } else {
        // Register / Request Access
        if (userData) {
          return new Response(JSON.stringify({
            success: false,
            status: userData.status,
            message: userData.status === 'pending' ? 'Başvurunuz zaten beklemede.' : 'Kullanıcı hesabı zaten mevcut.'
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        const newUser = {
          id: 'usr_' + Date.now().toString(36),
          email: username,
          date: new Date().toLocaleDateString('tr-TR') + ' ' + new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
          status: 'pending',
          role: 'user'
        };
        await context.env.RADIO_KV.put(`user:${username}`, JSON.stringify(newUser));
        return new Response(JSON.stringify({
          success: true,
          status: 'pending',
          message: 'Başvurunuz başarıyla alındı! Yönetici onayından sonra yayınlar açılacaktır.'
        }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Default edge response
    return new Response(JSON.stringify({
      success: true,
      status: action === 'request' ? 'pending' : 'approved',
      email: username,
      message: action === 'request' ? 'Başvurunuz alındı. Yönetici onayı bekleniyor.' : 'Giriş başarılı.'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, message: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
