import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Lock, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase/client';
import logo from '../../Assets/divine-logo.svg';

const Login = () => {
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const login = useAuthStore((state) => state.login);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      // Same public.sss_login(p_username, p_password) RPC the main
      // Service-Support-Supabase app's src/store/authStore.js uses — shared
      // login credentials across both apps (public.sss_login_users).
      const { data, error } = await supabase.rpc('sss_login', {
        p_username: id.trim(),
        p_password: password,
      });

      if (error) throw error;

      const matchedUser = Array.isArray(data) ? data[0] : data;

      if (!matchedUser) {
        toast.error('Invalid credentials');
        setSubmitting(false);
        return;
      }

      const role = String(matchedUser.role || '').trim().toLowerCase();

      // Validate role: engineers and admins are allowed; 'user' role is not.
      if (role === 'user') {
        toast.error('Access denied: User role is not authorized');
        setSubmitting(false);
        return;
      }

      // Map role to uppercase standard for the app ('ADMIN' / 'ENGINEER')
      const finalUser = {
        id: matchedUser.username,
        name: matchedUser.full_name,
        role: role === 'admin' ? 'ADMIN' : 'ENGINEER',
      };

      toast.success('Login successful!');
      login(finalUser);

      // Set compatibility keys in localstorage
      localStorage.setItem("currentUsername", finalUser.name);
      localStorage.setItem("o2d-auth-storage", JSON.stringify({ state: { user: { role: finalUser.role.toLowerCase() } } }));

      navigate("/", { replace: true });
    } catch (err) {
      console.error(err);
      toast.error('Login error');
    } finally {
      setSubmitting(false);
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  return (
    <div className="min-h-screen w-full flex flex-col bg-gradient-to-br from-sky-50 to-sky-100">
      {/* Center Content */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 space-y-6">
          
          {/* Logo Section */}
          <div className="flex flex-col items-center space-y-6">
            <div className="w-28 h-28 rounded-full border-4 border-sky-400 flex items-center justify-center shadow-lg bg-transparent">
              <img
                src={logo}
                alt="Logo"
                className="w-24 h-24 object-contain"
              />
            </div>
            <div className="text-center space-y-2">
              <h1 className="text-4xl font-bold text-gray-900">Divine Empire</h1>
              <p className="text-gray-600 text-base font-medium">Engineer Dashboard</p>
            </div>
          </div>

          {/* Form */}
          <form className="space-y-4" onSubmit={handleSubmit}>
            {/* User ID Input */}
            <div className="space-y-2">
              <label htmlFor="id" className="text-sm font-semibold text-gray-700">
                User ID
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="id"
                  name="id"
                  type="text"
                  required
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                  className="block w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white transition-all"
                  placeholder="Enter user ID"
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-semibold text-gray-700">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white transition-all"
                  placeholder="Enter password"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                  onClick={togglePasswordVisibility}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Login Button */}
            <button
              type="submit"
              disabled={submitting}
              className={`w-full py-3 px-4 text-base font-bold bg-sky-600 text-white rounded-lg hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-600 transition-all ${
                submitting ? 'opacity-70 cursor-not-allowed' : ''
              }`}
            >
              {submitting ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Signing in...</span>
                </div>
              ) : (
                'Sign In'
              )}
            </button>
          </form>


        </div>
      </div>

      {/* Footer at Bottom */}
      <div className="py-6 text-center">
        <p className="text-xs text-sky-700">
          Powered by <span className="font-semibold text-sky-600">Botivate</span>
        </p>
      </div>
    </div>
  );
};

export default Login;
