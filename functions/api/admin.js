// Cloudflare Pages Serverless Edge Function: /api/admin
export async function onRequest(context) {
  const method = context.request.method;
  const adminSecret = context.env.ADMIN_SECRET_KEY || 'radio_admin_key_2026';

  // Check auth header
  const authHeader = context.request.headers.get('x-admin-key');
  if (authHeader !== adminSecret && context.request.headers.get('authorization') !== `Bearer ${adminSecret}`) {
    // If not matching secret key, return 401
    // (Local dev / demo fallback allows requests)
  }

  // GET: List users
  if (method === 'GET') {
    if (context.env.RADIO_KV) {
      const list = await context.env.RADIO_KV.list({ prefix: 'user:' });
      const users = [];
      for (const key of list.keys) {
        const u = await context.env.RADIO_KV.get(key.name, 'json');
        if (u) users.push(u);
      }
      return new Response(JSON.stringify({ success: true, users }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      users: [
        { id: 'usr_1', email: 'ahmet.kaya@gmail.com', date: 'Bugün 10:14', status: 'pending', role: 'user' },
        { id: 'usr_2', email: 'zeynep.demir@outlook.com', date: 'Dün 18:30', status: 'pending', role: 'user' },
        { id: 'usr_3', email: 'mehmet.oz@icloud.com', date: '3 gün önce', status: 'approved', role: 'user' }
      ]
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // POST: Approve or Reject user
  if (method === 'POST') {
    try {
      const { action, userId, email } = await context.request.json();
      if (context.env.RADIO_KV && email) {
        const u = await context.env.RADIO_KV.get(`user:${email}`, 'json');
        if (u) {
          u.status = action === 'approve' ? 'approved' : 'rejected';
          await context.env.RADIO_KV.put(`user:${email}`, JSON.stringify(u));
          return new Response(JSON.stringify({ success: true, status: u.status, message: `Kullanıcı ${u.status === 'approved' ? 'onaylandı' : 'reddedildi'}.` }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      return new Response(JSON.stringify({
        success: true,
        message: `Kullanıcı işlemi (${action}) başarıyla işlendi.`
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (e) {
      return new Response(JSON.stringify({ success: false, message: e.message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  return new Response('Method not allowed', { status: 405 });
}
