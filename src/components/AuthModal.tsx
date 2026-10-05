import React, { useEffect, useState } from 'react';
import { X, User, Building2, CheckCircle2, Mail, ArrowLeft, ShieldCheck } from 'lucide-react';
import { RRGBSLogo } from './common/RRGBSLogo';
import { api, setToken } from '../api';

interface AuthModalProps {
  isOpen: boolean;
  initialMode: 'login' | 'register';
  onClose: () => void;
  onSuccess: (user: { name: string; role: 'candidate' | 'employer'; email: string }) => void;
}

type RecoveryStep = 'request' | 'verify';

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, initialMode, onClose, onSuccess }) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [role, setRole] = useState<'candidate' | 'employer'>('candidate');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [recoveryStep, setRecoveryStep] = useState<RecoveryStep>('request');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetMessage, setResetMessage] = useState('');

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setErrorMsg('');
      setForgotOpen(false);
      setRecoveryStep('request');
      setResetCode('');
      setResetMessage('');
    }
  }, [isOpen, initialMode]);

  if (!isOpen) return null;

  const closeAndReset = () => {
    setForgotOpen(false); setRecoveryStep('request'); setResetCode(''); setNewPassword(''); setResetMessage(''); setErrorMsg('');
    onClose();
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setErrorMsg(''); setIsSubmitting(true);
    try {
      const result = mode === 'register'
        ? await api.register({ name, email, phone, password, role, companyName })
        : await api.login({ email, password, role });
      setToken(result.token); setPassword(''); onClose(); onSuccess(result.user);
    } catch (error) { setErrorMsg(error instanceof Error ? error.message : 'Authentication failed.'); }
    finally { setIsSubmitting(false); }
  };

  const requestReset = async (e: React.FormEvent) => {
    e.preventDefault(); setErrorMsg(''); setResetMessage(''); setIsSubmitting(true);
    try {
      await api.forgotPassword({ email: email.trim() });
      setRecoveryStep('verify');
      setResetMessage('If an account exists for this email, a 6-digit reset code has been sent.');
    } catch (error) { setErrorMsg(error instanceof Error ? error.message : 'Could not send the reset code.'); }
    finally { setIsSubmitting(false); }
  };

  const completeReset = async (e: React.FormEvent) => {
    e.preventDefault(); setErrorMsg(''); setResetMessage(''); setIsSubmitting(true);
    try {
      const result = await api.resetPassword({ email: email.trim(), code: resetCode.trim(), password: newPassword });
      setResetMessage(result.message);
      setRecoveryStep('request'); setForgotOpen(false); setMode('login'); setPassword(''); setResetCode(''); setNewPassword('');
    } catch (error) { setErrorMsg(error instanceof Error ? error.message : 'Could not reset your password.'); }
    finally { setIsSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-gray-200 relative my-6 overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3"><RRGBSLogo size={36} /><div><h2 className="font-extrabold text-lg text-gray-900 leading-tight">{forgotOpen ? 'Reset Your Password' : mode === 'login' ? 'Sign In to RRGBS Jobs' : 'Create Free Account'}</h2><div className="text-xs text-gray-500 font-medium">{forgotOpen ? 'Secure account recovery' : 'Access curated jobs and recruitment solutions'}</div></div></div>
          <button type="button" onClick={closeAndReset} className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6">
          {forgotOpen ? (
            <>
              {errorMsg && <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">{errorMsg}</div>}
              {resetMessage && <div className="mb-3 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-lg flex gap-2"><CheckCircle2 className="w-4 h-4 shrink-0" />{resetMessage}</div>}
              {recoveryStep === 'request' ? (
                <form onSubmit={requestReset} className="space-y-4">
                  <div className="w-12 h-12 rounded-xl bg-red-50 text-[#d71920] flex items-center justify-center"><Mail className="w-6 h-6" /></div>
                  <p className="text-sm text-gray-600 leading-relaxed">Enter the email address linked to your RRGBS account. We’ll send a time-limited verification code.</p>
                  <div><label className="block text-xs font-bold text-gray-700 mb-1">Email Address</label><input autoFocus type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#d71920] focus:bg-white transition-all" /></div>
                  <button type="submit" disabled={isSubmitting} className="w-full bg-[#d71920] hover:bg-[#b8141a] disabled:opacity-60 text-white py-2.5 rounded-lg text-xs font-bold transition-all shadow-md cursor-pointer">{isSubmitting ? 'Sending…' : 'Send Reset Code'}</button>
                </form>
              ) : (
                <form onSubmit={completeReset} className="space-y-4">
                  <div className="w-12 h-12 rounded-xl bg-red-50 text-[#d71920] flex items-center justify-center"><ShieldCheck className="w-6 h-6" /></div>
                  <p className="text-sm text-gray-600">Enter the 6-digit code sent to <b>{email}</b>, then choose a new password.</p>
                  <div><label className="block text-xs font-bold text-gray-700 mb-1">Verification Code</label><input autoFocus inputMode="numeric" maxLength={6} required value={resetCode} onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-lg tracking-[0.4em] font-bold outline-none focus:border-[#d71920] focus:bg-white transition-all" /></div>
                  <div><label className="block text-xs font-bold text-gray-700 mb-1">New Password</label><input type="password" minLength={8} required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 8 characters" className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#d71920] focus:bg-white transition-all" /></div>
                  <button type="submit" disabled={isSubmitting} className="w-full bg-[#d71920] hover:bg-[#b8141a] disabled:opacity-60 text-white py-2.5 rounded-lg text-xs font-bold transition-all shadow-md cursor-pointer">{isSubmitting ? 'Updating…' : 'Update Password'}</button>
                  <button type="button" onClick={() => { setRecoveryStep('request'); setErrorMsg(''); }} className="w-full text-xs font-bold text-gray-500 hover:text-[#d71920] flex items-center justify-center gap-1 cursor-pointer"><ArrowLeft className="w-3.5 h-3.5" /> Request a new code</button>
                </form>
              )}
              <div className="mt-5 pt-4 border-t border-gray-100"><button type="button" onClick={() => { setForgotOpen(false); setRecoveryStep('request'); setErrorMsg(''); }} className="w-full text-xs font-bold text-gray-600 hover:text-[#d71920] cursor-pointer">Back to Sign In</button></div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 bg-gray-100 p-1 rounded-xl mb-5 text-xs font-bold">
                <button type="button" onClick={() => setRole('candidate')} className={`py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${role === 'candidate' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-900'}`}><User className="w-3.5 h-3.5 text-[#d71920]" /><span>Job Seeker</span></button>
                <button type="button" onClick={() => setRole('employer')} className={`py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${role === 'employer' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-900'}`}><Building2 className="w-3.5 h-3.5 text-[#d71920]" /><span>Employer / Recruiter</span></button>
              </div>
              {errorMsg && <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">{errorMsg}</div>}
              <form onSubmit={handleAuthSubmit} className="space-y-3.5">
              <div>
  <label className="block text-xs font-bold text-gray-700 mb-1">
    Mobile Number
  </label>

  <input
    type="tel"
    required
    inputMode="numeric"
    autoComplete="tel"
    placeholder="+91 98765 43210"
    value={phone}
    onChange={(e) => {
      const value = e.target.value.replace(/[^\d+]/g, '');
      setPhone(value);
    }}
    pattern="^(?:\+91|91)?[6-9]\d{9}$"
    title="Enter a valid 10-digit Indian mobile number"
    maxLength={13}
    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs sm:text-sm outline-none focus:border-[#d71920] focus:bg-white transition-all"
  />

  <p className="mt-1 text-[11px] text-gray-500">
    Enter a valid 10-digit Indian mobile number.
  </p>
</div>
                <div><label className="block text-xs font-bold text-gray-700 mb-1">Email Address</label><input type="email" required placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs sm:text-sm outline-none focus:border-[#d71920] focus:bg-white transition-all" /></div>
                <div><label className="block text-xs font-bold text-gray-700 mb-1">Password</label><input type="password" minLength={8} required placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs sm:text-sm outline-none focus:border-[#d71920] focus:bg-white transition-all" /></div>
                {mode === 'login' && <div className="text-right"><button type="button" onClick={() => { setForgotOpen(true); setErrorMsg(''); setResetMessage(''); }} className="text-xs font-bold text-[#d71920] hover:underline cursor-pointer">Forgot password?</button></div>}
                <button type="submit" disabled={isSubmitting} className="w-full bg-[#d71920] hover:bg-[#b8141a] disabled:opacity-60 text-white py-2.5 rounded-lg text-xs font-bold transition-all shadow-md active:scale-98 cursor-pointer">{isSubmitting ? 'Please wait…' : mode === 'login' ? `Sign In as ${role === 'employer' ? 'Employer' : 'Candidate'}` : 'Create Account'}</button>
              </form>
              <div className="mt-5 pt-4 border-t border-gray-100 text-center text-xs text-gray-600">{mode === 'login' ? <>Don’t have an account yet? <button type="button" onClick={() => setMode('register')} className="font-bold text-[#d71920] hover:underline cursor-pointer">Register here</button></> : <>Already have an account? <button type="button" onClick={() => setMode('login')} className="font-bold text-[#d71920] hover:underline cursor-pointer">Sign in</button></>}</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
