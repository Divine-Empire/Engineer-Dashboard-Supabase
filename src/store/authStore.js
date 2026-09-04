import { create } from 'zustand';

const storedUser = localStorage.getItem('user');
let parsedUser = null;
try {
  parsedUser = storedUser ? JSON.parse(storedUser) : null;
} catch (e) {
  parsedUser = null;
}

const useAuthStore = create((set) => ({
  user: parsedUser,
  isAuthenticated: !!parsedUser,
  
  login: (userData) => {
    set({
      user: userData,
      isAuthenticated: true
    });
    localStorage.setItem('user', JSON.stringify(userData));
  },
  
  logout: () => {
    set({
      user: null,
      isAuthenticated: false
    });
    localStorage.removeItem('user');
  },
  
  initializeAuth: () => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      set({
        user: JSON.parse(storedUser),
        isAuthenticated: true
      });
    }
  }
}));

export { useAuthStore };
