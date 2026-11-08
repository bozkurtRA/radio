// rAdio Authentication & Admin Approval System (Section 12)
class RadioAuthManager {
  constructor() {
    this.currentUser = RadioStorage.getUser();
    this.pendingUsersKey = 'radio_admin_pending_users';
    this._initMockUsers();
  }

  _initMockUsers() {
    if (!localStorage.getItem(this.pendingUsersKey)) {
      const initialUsers = [
        { id: 'usr_1', email: 'ahmet.kaya@gmail.com', date: 'Bugün 10:14', status: 'pending', role: 'user' },
        { id: 'usr_2', email: 'zeynep.demir@outlook.com', date: 'Dün 18:30', status: 'pending', role: 'user' },
        { id: 'usr_3', email: 'mehmet.oz@icloud.com', date: '3 gün önce', status: 'approved', role: 'user' },
        { id: 'usr_4', email: 'spam_account@temp.com', date: '5 gün önce', status: 'rejected', role: 'user' }
      ];
      localStorage.setItem(this.pendingUsersKey, JSON.stringify(initialUsers));
    }
  }

  getAllUsers() {
    try {
      return JSON.parse(localStorage.getItem(this.pendingUsersKey)) || [];
    } catch {
      return [];
    }
  }

  saveUsers(users) {
    localStorage.setItem(this.pendingUsersKey, JSON.stringify(users));
  }

  // Request Access / Register (Async with Cloudflare Pages Function edge support)
  async requestAccess(email, password) {
    if (!email || !email.includes('@')) {
      return { success: false, message: 'Lütfen geçerli bir e-posta adresi girin.' };
    }

    // 1. Try Cloudflare Pages Function Edge API
    try {
      const resp = await fetch('./api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request', email, password })
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data && data.status) {
          const session = { email: email.trim(), role: data.role || 'user', status: data.status, isAdmin: !!data.isAdmin };
          RadioStorage.setUser(session);
          this.currentUser = session;
          return data;
        }
      }
    } catch (e) {
      // Local fallback if edge API offline
    }

    // 2. Local Fallback Simulation
    const users = this.getAllUsers();
    const existing = users.find(u => u.email.toLowerCase() === email.toLowerCase());

    if (existing) {
      if (existing.status === 'pending') {
        return { success: false, status: 'pending', message: 'Başvurunuz zaten alınmış ve yönetici onayı beklemektedir.' };
      } else if (existing.status === 'rejected') {
        return { success: false, status: 'rejected', message: 'Başvurunuz yönetici tarafından reddedilmiştir. Destek ile iletişime geçin.' };
      } else if (existing.status === 'approved') {
        const session = { email: existing.email, role: existing.role || 'user', status: 'approved', isAdmin: existing.role === 'admin' };
        RadioStorage.setUser(session);
        this.currentUser = session;
        return { success: true, status: 'approved', message: 'Giriş başarılı!' };
      }
    }

    // Special hardcoded admin for testing demo & owner
    const masterAdmins = ['admin@radio.app', 'bozkurtraa@gmail.com'];
    if (masterAdmins.includes(email.toLowerCase())) {
      const adminSession = { email, role: 'admin', status: 'approved', isAdmin: true };
      RadioStorage.setUser(adminSession);
      this.currentUser = adminSession;
      return { success: true, status: 'approved', isAdmin: true, message: 'Yönetici girişi başarılı!' };
    }

    // New Registration: Create Pending Entry
    const newUser = {
      id: 'usr_' + Date.now().toString(36),
      email: email.trim(),
      date: 'Az önce',
      status: 'pending',
      role: 'user'
    };
    users.unshift(newUser);
    this.saveUsers(users);

    const pendingSession = { email: newUser.email, role: 'user', status: 'pending', isAdmin: false };
    RadioStorage.setUser(pendingSession);
    this.currentUser = pendingSession;

    return {
      success: true,
      status: 'pending',
      message: 'Başvurunuz başarıyla alındı! Yönetici onayından sonra radyo yayınlarına erişebileceksiniz.'
    };
  }

  // Login (Async with Cloudflare Pages Function edge support)
  async login(email, password) {
    // 1. Try Cloudflare Pages Function Edge API
    try {
      const resp = await fetch('./api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', email, password })
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.success && data.status === 'approved') {
          const session = { email: email.trim(), role: data.role || 'user', status: 'approved', isAdmin: !!data.isAdmin };
          RadioStorage.setUser(session);
          this.currentUser = session;
          return data;
        } else if (data.status) {
          const session = { email: email.trim(), role: data.role || 'user', status: data.status, isAdmin: !!data.isAdmin };
          RadioStorage.setUser(session);
          this.currentUser = session;
          return data;
        }
      }
    } catch (e) {
      // Local fallback
    }

    // 2. Local Fallback Simulation
    const masterAdmins = ['admin@radio.app', 'bozkurtraa@gmail.com'];
    if (masterAdmins.includes(email.toLowerCase()) && (password === 'admin123' || password.length >= 4)) {
      const adminSession = { email, role: 'admin', status: 'approved', isAdmin: true };
      RadioStorage.setUser(adminSession);
      this.currentUser = adminSession;
      return { success: true, user: adminSession, message: 'Yönetici girişi yapıldı.' };
    }

    const users = this.getAllUsers();
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

    if (!user) {
      return this.requestAccess(email, password);
    }

    const session = { email: user.email, role: user.role || 'user', status: user.status, isAdmin: user.role === 'admin' };
    RadioStorage.setUser(session);
    this.currentUser = session;

    if (user.status === 'pending') {
      return { success: false, status: 'pending', message: 'Hesabınız henüz onaylanmadı. Yönetici onayı bekleniyor.' };
    } else if (user.status === 'rejected') {
      return { success: false, status: 'rejected', message: 'Hesap erişiminiz yönetici tarafından durdurulmuştur.' };
    }

    return { success: true, user: session, message: 'Giriş başarılı.' };
  }

  // Admin Actions: Approve User
  approveUser(userId) {
    const users = this.getAllUsers();
    const u = users.find(x => x.id === userId);
    if (u) {
      u.status = 'approved';
      this.saveUsers(users);

      // If current active user was approved, update session
      if (this.currentUser && this.currentUser.email === u.email) {
        this.currentUser.status = 'approved';
        RadioStorage.setUser(this.currentUser);
      }
      return true;
    }
    return false;
  }

  // Admin Actions: Reject User
  rejectUser(userId) {
    const users = this.getAllUsers();
    const u = users.find(x => x.id === userId);
    if (u) {
      u.status = 'rejected';
      this.saveUsers(users);

      if (this.currentUser && this.currentUser.email === u.email) {
        this.currentUser.status = 'rejected';
        RadioStorage.setUser(this.currentUser);
      }
      return true;
    }
    return false;
  }

  logout() {
    RadioStorage.clearUser();
    this.currentUser = null;
  }
}

window.RadioAuthManager = RadioAuthManager;
