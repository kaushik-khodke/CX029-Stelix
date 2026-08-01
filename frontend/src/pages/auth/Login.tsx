import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { supabase } from "@/lib/supabase";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { LogIn, Mail, Lock, ArrowRight, Shield, Zap, Loader2, ArrowLeft } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

export function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState(false);
  const [pageError, setPageError] = useState<string>("");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    if (isLoading) return;

    setIsLoading(true);
    setPageError("");

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (error) throw error;

      navigate("/dashboard");
    } catch (error: unknown) {
      setPageError(error instanceof Error ? error.message : "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOAuthLogin = async (provider: 'google' | 'github') => {
    if (isLoading) return;
    setIsLoading(true);
    setPageError("");
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/dashboard`
        }
      });
      if (error) setPageError(error.message);
    } catch (err: unknown) {
      setPageError(err instanceof Error ? err.message : "OAuth sign in failed");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden flex bg-slate-50 selection:bg-cyan-400/30">
      {/* Back Button */}
      <button
        onClick={() => navigate("/")}
        className="absolute top-6 left-6 md:top-8 md:left-8 z-50 flex items-center gap-2 text-slate-700 bg-white/20 hover:bg-white/40 backdrop-blur-md border border-white/30 px-4 py-2 rounded-full shadow-sm transition-all duration-300 font-medium text-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      {/* SEAMLESS BACKGROUND VIDEO FOR ENTIRE PAGE */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="fixed inset-0 w-full h-full object-cover z-0 pointer-events-none opacity-100"
        src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260715_082433_69699cf8-444b-4484-93cc-053e57896dfd.mp4"
      />
      {/* Light overlay for contrast */}
      <div className="fixed inset-0 bg-white/50 z-0 pointer-events-none" />

      {/* Left: Branding (visible on larger screens) */}
      <div className="hidden lg:flex lg:w-[45%] xl:w-[50%] flex-col justify-center px-12 xl:px-20 relative z-10">
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-md"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-sm font-medium text-cyan-700 mb-8 liquid-glass shadow-sm">
            <Shield className="h-4 w-4" />
            Secure health records
          </div>
          <h1 className="text-4xl xl:text-5xl font-bold font-heading tracking-tight text-slate-900 mb-4">
            Welcome back to{" "}
            <span className="bg-gradient-to-r from-blue-600 via-cyan-500 to-teal-500 bg-clip-text text-transparent drop-shadow-sm">
              MyHealthChain
            </span>
          </h1>
          <p className="text-lg text-slate-600 font-light mb-10 max-w-sm">
            Sign in to access your encrypted health records and AI-assisted insights.
          </p>
          <ul className="space-y-4">
            {[
              { icon: Shield, text: "End-to-end encryption" },
              { icon: Zap, text: "AI-powered health assistant" },
            ].map(({ icon: Icon, text }, i) => (
              <motion.li
                key={text}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.1 }}
                className="flex items-center gap-3 text-slate-600 font-light"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg liquid-glass text-cyan-600 border border-cyan-200">
                  <Icon className="h-4 w-4" />
                </div>
                <span>{text}</span>
              </motion.li>
            ))}
          </ul>
        </motion.div>
      </div>

      {/* Right: Form */}
      <div className="flex-1 flex items-center justify-center px-4 py-12 lg:py-16 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md"
        >
          <div className="liquid-glass border-none shadow-2xl rounded-[2.5rem] overflow-hidden transition-all duration-300 hover:bg-white/40">
            <div className="flex flex-col space-y-1.5 pb-4 pt-8 px-8">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl liquid-glass border border-slate-200 flex items-center justify-center shadow-sm">
                  <LogIn className="w-6 h-6 text-cyan-600" />
                </div>
                <div>
                  <h3 className="text-2xl font-heading font-bold text-slate-900 leading-none tracking-tight">
                    {t("auth.login")}
                  </h3>
                  <p className="text-sm text-slate-500 font-light mt-0.5">
                    Access your records securely
                  </p>
                </div>
              </div>
            </div>

            <div className="px-8 pb-8 pt-2">
              {pageError ? (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                >
                  {pageError}
                </motion.div>
              ) : null}

              <form onSubmit={handleSubmit(onSubmit)}>
                <motion.div
                  variants={container}
                  initial="hidden"
                  animate="show"
                  className="space-y-5"
                >
                  <motion.div variants={item}>
                    <label className="text-sm font-medium text-slate-700 block mb-1.5">
                      Email
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                      <Input
                        placeholder="you@example.com"
                        autoComplete="email"
                        className="pl-10 h-12 rounded-xl border-slate-200 bg-white/50 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-cyan-400/50 transition-colors"
                        {...register("email")}
                      />
                    </div>
                    {errors.email ? (
                      <p className="text-xs text-red-500 mt-1.5">
                        {String(errors.email.message)}
                      </p>
                    ) : null}
                  </motion.div>

                  <motion.div variants={item}>
                    <label className="text-sm font-medium text-slate-700 block mb-1.5">
                      Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                      <Input
                        type="password"
                        placeholder="••••••••"
                        autoComplete="current-password"
                        className="pl-10 h-12 rounded-xl border-slate-200 bg-white/50 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-cyan-400/50 transition-colors"
                        {...register("password")}
                      />
                    </div>
                    {errors.password ? (
                      <p className="text-xs text-red-500 mt-1.5">
                        {String(errors.password.message)}
                      </p>
                    ) : null}
                    <div className="flex justify-end mt-1.5">
                      <button
                        type="button"
                        className="text-xs text-cyan-600 hover:text-cyan-700 transition-colors font-medium"
                        onClick={() => navigate("/reset-password")}
                      >
                        {t("auth.forgot_password")}
                      </button>
                    </div>
                  </motion.div>

                  <motion.div variants={item}>
                    <Button
                      type="submit"
                      className="w-full h-14 rounded-full bg-cyan-500 text-white hover:bg-cyan-600 hover:scale-[1.02] shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:shadow-[0_0_30px_rgba(6,182,212,0.5)] text-base font-semibold gap-2 mt-4 transition-all duration-300"
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Signing in...
                        </>
                      ) : (
                        <>
                          {t("auth.login")}
                          <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </Button>
                  </motion.div>
                </motion.div>
              </form>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-slate-50/90 backdrop-blur-md px-3 text-slate-400 font-medium">
                    Or continue with
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isLoading}
                  onClick={() => handleOAuthLogin('google')}
                  className="h-11 rounded-xl border-slate-200 bg-white/70 hover:bg-white text-slate-700 font-medium gap-2 shadow-sm transition-all"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  Google
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  disabled={isLoading}
                  onClick={() => handleOAuthLogin('github')}
                  className="h-11 rounded-xl border-slate-200 bg-white/70 hover:bg-white text-slate-700 font-medium gap-2 shadow-sm transition-all"
                >
                  <svg className="w-4 h-4 fill-slate-800" viewBox="0 0 24 24">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                  </svg>
                  GitHub
                </Button>
              </div>

              <p className="mt-6 text-center text-sm text-slate-600 font-light">
                {t("auth.no_account")}{" "}
                <button
                  type="button"
                  className="text-cyan-600 font-semibold hover:text-cyan-700 transition-colors focus:outline-none"
                  onClick={() => !isLoading && navigate("/signup")}
                >
                  {t("auth.signup")}
                </button>
              </p>


            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
