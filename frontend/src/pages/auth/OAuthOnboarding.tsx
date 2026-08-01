import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { motion } from "framer-motion";
import {
  UserPlus,
  Stethoscope,
  User,
  Phone,
  Building2,
  BadgeCheck,
  ArrowRight,
  Loader2,
  MapPin,
} from "lucide-react";

const onboardingSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters"),
  phone: z.string().min(10, "Phone number must be at least 10 digits"),
  hospital: z.string().optional(),
  licenseId: z.string().optional(),
  address: z.string().optional(),
});

type OnboardingFormData = z.infer<typeof onboardingSchema>;

function generateUHID() {
  const base = Math.floor(1000000000 + Math.random() * 9000000000);
  return String(base);
}

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.05 },
  },
};

const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
};

export function OAuthOnboarding() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [role, setRole] = useState<"patient" | "doctor">("patient");
  const [isLoading, setIsLoading] = useState(false);
  const [pageError, setPageError] = useState<string>("");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<OnboardingFormData>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      fullName: user?.user_metadata?.full_name || user?.user_metadata?.name || "",
      phone: "",
    },
  });

  const onSubmit = async (data: OnboardingFormData) => {
    if (isLoading || !user) return;
    setIsLoading(true);
    setPageError("");

    try {
      // 1. Create profile
      const { error: profileError } = await supabase.from("profiles").upsert({
        id: user.id,
        role: role,
        full_name: data.fullName,
        phone: data.phone,
      }, { onConflict: 'id' });

      if (profileError) throw new Error("Failed to create profile: " + profileError.message);

      // 2. Sync role to user metadata
      await supabase.auth.updateUser({
        data: { role, full_name: data.fullName, phone: data.phone },
      });

      // 3. Create role-specific record
      if (role === "doctor") {
        await supabase.from("doctors").upsert({
          id: user.id,
          hospital: data.hospital || null,
          license_id: data.licenseId || null,
          verified: false,
        }, { onConflict: 'id' });
      } else {
        await supabase.from("patients").upsert({
          id: user.id,
          user_id: user.id,
          full_name: data.fullName,
          phone: data.phone,
          uhid: generateUHID(),
        }, { onConflict: 'id' });
      }

      // Force profile reload by navigating
      navigate("/dashboard");
      window.location.reload();
    } catch (error: unknown) {
      setPageError(error instanceof Error ? error.message : "Failed to complete setup");
    } finally {
      setIsLoading(false);
    }
  };

  if (!user) {
    navigate("/login");
    return null;
  }

  const userEmail = user.email || "";
  const avatarUrl = user.user_metadata?.avatar_url || "";

  return (
    <div className="min-h-screen relative overflow-hidden flex bg-slate-50 selection:bg-cyan-400/30">
      {/* Background */}
      <div className="absolute inset-0 -z-10 bg-slate-50" />
      <div className="absolute top-0 left-0 w-[45%] h-[60%] rounded-full bg-cyan-400/10 blur-3xl -z-10" />
      <div className="absolute bottom-0 right-0 w-[50%] h-[55%] rounded-full bg-teal-400/10 blur-3xl -z-10" />

      {/* Left: Branding */}
      <div className="hidden lg:flex lg:w-[45%] xl:w-[50%] flex-col justify-center px-12 xl:px-20">
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-md"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-sm font-medium text-cyan-700 mb-8">
            <UserPlus className="h-4 w-4" />
            Complete Your Profile
          </div>
          <h1 className="text-4xl xl:text-5xl font-bold tracking-tight text-slate-900 mb-4">
            Welcome to{" "}
            <span className="bg-gradient-to-r from-cyan-600 to-teal-500 bg-clip-text text-transparent">
              MyHealthChain
            </span>
          </h1>
          <p className="text-lg text-slate-500 mb-10 max-w-sm">
            You've signed in successfully. Just a few more details and you're all set!
          </p>

          {/* Show connected account */}
          <div className="flex items-center gap-3 bg-white/80 backdrop-blur rounded-2xl p-4 border border-slate-200 shadow-sm">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="w-10 h-10 rounded-full" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-cyan-100 flex items-center justify-center">
                <User className="w-5 h-5 text-cyan-600" />
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-slate-700">Connected as</p>
              <p className="text-sm text-slate-500">{userEmail}</p>
            </div>
          </div>
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
                  <UserPlus className="w-6 h-6 text-cyan-600" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-slate-900 leading-none tracking-tight">
                    Complete Setup
                  </h3>
                  <p className="text-sm text-slate-500 font-light mt-0.5">
                    Tell us a bit about yourself
                  </p>
                </div>
              </div>
            </div>

            <div className="px-8 pb-8 pt-2">
              {pageError && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600"
                >
                  {pageError}
                </motion.div>
              )}

              {/* Role Toggle */}
              <div className="mb-5">
                <label className="text-sm font-medium text-slate-700 block mb-2">I am a</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRole("patient")}
                    className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
                      role === "patient"
                        ? "border-cyan-400 bg-cyan-50 text-cyan-700 shadow-sm"
                        : "border-slate-200 bg-white/50 text-slate-500 hover:bg-white"
                    }`}
                  >
                    <User className="w-4 h-4" />
                    Patient
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole("doctor")}
                    className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
                      role === "doctor"
                        ? "border-cyan-400 bg-cyan-50 text-cyan-700 shadow-sm"
                        : "border-slate-200 bg-white/50 text-slate-500 hover:bg-white"
                    }`}
                  >
                    <Stethoscope className="w-4 h-4" />
                    Doctor
                  </button>
                </div>
              </div>

              <form onSubmit={handleSubmit(onSubmit)}>
                <motion.div
                  variants={container}
                  initial="hidden"
                  animate="show"
                  className="space-y-4"
                >
                  {/* Full Name */}
                  <motion.div variants={item}>
                    <label className="text-sm font-medium text-slate-700 block mb-1.5">
                      Full Name
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                      <Input
                        placeholder="Your full name"
                        className="pl-10 h-12 rounded-xl border-slate-200 bg-white/50 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-cyan-400/50 transition-colors"
                        {...register("fullName")}
                      />
                    </div>
                    {errors.fullName && (
                      <p className="text-xs text-red-500 mt-1.5">{String(errors.fullName.message)}</p>
                    )}
                  </motion.div>

                  {/* Phone */}
                  <motion.div variants={item}>
                    <label className="text-sm font-medium text-slate-700 block mb-1.5">
                      Phone Number
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                      <Input
                        placeholder="+91 XXXXX XXXXX"
                        className="pl-10 h-12 rounded-xl border-slate-200 bg-white/50 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-cyan-400/50 transition-colors"
                        {...register("phone")}
                      />
                    </div>
                    {errors.phone && (
                      <p className="text-xs text-red-500 mt-1.5">{String(errors.phone.message)}</p>
                    )}
                  </motion.div>

                  {/* Doctor-specific fields */}
                  {role === "doctor" && (
                    <>
                      <motion.div variants={item}>
                        <label className="text-sm font-medium text-slate-700 block mb-1.5">
                          Hospital / Clinic
                        </label>
                        <div className="relative">
                          <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                          <Input
                            placeholder="Hospital name"
                            className="pl-10 h-12 rounded-xl border-slate-200 bg-white/50 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-cyan-400/50 transition-colors"
                            {...register("hospital")}
                          />
                        </div>
                      </motion.div>

                      <motion.div variants={item}>
                        <label className="text-sm font-medium text-slate-700 block mb-1.5">
                          License ID
                        </label>
                        <div className="relative">
                          <BadgeCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                          <Input
                            placeholder="Medical license number"
                            className="pl-10 h-12 rounded-xl border-slate-200 bg-white/50 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-cyan-400/50 transition-colors"
                            {...register("licenseId")}
                          />
                        </div>
                      </motion.div>
                    </>
                  )}

                  {/* Address (optional) */}
                  <motion.div variants={item}>
                    <label className="text-sm font-medium text-slate-700 block mb-1.5">
                      Address <span className="text-slate-400">(optional)</span>
                    </label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                      <Input
                        placeholder="Your address"
                        className="pl-10 h-12 rounded-xl border-slate-200 bg-white/50 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-cyan-400/50 transition-colors"
                        {...register("address")}
                      />
                    </div>
                  </motion.div>

                  {/* Submit */}
                  <motion.div variants={item}>
                    <Button
                      type="submit"
                      className="w-full h-14 rounded-full bg-cyan-500 text-white hover:bg-cyan-600 hover:scale-[1.02] shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:shadow-[0_0_30px_rgba(6,182,212,0.5)] text-base font-semibold gap-2 mt-4 transition-all duration-300"
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Setting up...
                        </>
                      ) : (
                        <>
                          Complete Setup
                          <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </Button>
                  </motion.div>
                </motion.div>
              </form>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
