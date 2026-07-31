import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";

import { Navbar } from "@/components/layout/Navbar";
import { Landing } from "@/pages/Landing";
import { Login } from "@/pages/auth/Login";
import { Signup } from "@/pages/auth/Signup";
import { useAuth } from "@/hooks/useAuth";

// Lazy load pages for better performance
const PatientDashboard = React.lazy(() =>
  import("@/pages/patient/Dashboard").then((module) => ({ default: module.default }))
);
const Records = React.lazy(() => import("@/pages/patient/Records"));
const PatientConsent = React.lazy(() => import("./pages/patient/Consent"));
const Analysis = React.lazy(() =>
  import("@/pages/patient/Analysis").then((module) => ({ default: module.Analysis }))
);
const PharmacyChat = React.lazy(() =>
  import("@/pages/patient/PharmacyChat").then((module) => ({ default: module.PharmacyChat }))
);
const MyMedicines = React.lazy(() => import("@/pages/patient/MyMedicines"));
const HealthTracker = React.lazy(() => import("@/pages/patient/HealthTracker"));


const Chat = React.lazy(() =>
  import("@/pages/patient/Chat").then((module) => ({ default: module.Chat }))
);
const DoctorDashboard = React.lazy(() => import("@/pages/doctor/Dashboard"));
const Scan = React.lazy(() =>
  import("@/pages/doctor/Scan").then((module) => ({ default: module.Scan }))
);
const PatientView = React.lazy(() =>
  import("@/pages/doctor/PatientView").then((module) => ({ default: module.PatientView }))
);

const PharmacistDashboard = React.lazy(() => import("@/pages/pharmacist/Dashboard"));

const HospitalDashboard = React.lazy(() => import("@/pages/hospital/Dashboard"));

const ResetPassword = React.lazy(() =>
  import("@/pages/auth/ResetPassword").then((module) => ({ default: module.ResetPassword }))
);
const UpdatePassword = React.lazy(() =>
  import("@/pages/auth/UpdatePassword").then((module) => ({ default: module.UpdatePassword }))
);

const PaymentSuccess = React.lazy(() => import("@/pages/PaymentSuccess"));
const PaymentCancel = React.lazy(() => import("@/pages/PaymentCancel"));

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <LoadingSpinner />;
  if (!user) return <Navigate to="/login" replace />;

  return <React.Suspense fallback={<LoadingSpinner />}>{children}</React.Suspense>;
}

// Checks both authentication AND role. Redirects unauthorized users to /dashboard
// so DashboardRouter can send them to their correct home page.
function RoleRoute({
  allowedRole,
  children,
}: {
  allowedRole: "patient" | "doctor" | "pharmacist" | "hospital";
  children: React.ReactNode;
}) {
  const { user, role, loading } = useAuth();

  if (loading) return <LoadingSpinner />;
  if (!user) return <Navigate to="/login" replace />;

  // Use the same smart resolvedRole from useAuth — do NOT recompute inline.
  // Inline recomputation (profile?.role ?? meta) would bypass the trigger/RLS
  // workaround and cause an infinite redirect loop for pharmacists.
  if (role !== allowedRole) return <Navigate to="/dashboard" replace />;

  return <React.Suspense fallback={<LoadingSpinner />}>{children}</React.Suspense>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <LoadingSpinner />;
  if (user) return <Navigate to="/dashboard" replace />;

  return <React.Suspense fallback={<LoadingSpinner />}>{children}</React.Suspense>;
}

function DashboardRouter() {
  const { role, loading } = useAuth();

  if (loading) return <LoadingSpinner />;

  // Temporary dev log to see exactly what role is evaluated:
  console.log("DashboardRouter Role:", role);

  if (role === "doctor") return <DoctorDashboard />;
  if (role === "pharmacist") return <Navigate to="/pharmacist/dashboard" replace />;
  if (role === "hospital") return <Navigate to="/hospital/triage" replace />;

  if (role !== "patient" && role !== "doctor" && role !== "pharmacist" && role !== "hospital") {
    // If we reach here, role is something unexpected (maybe null or undefined)
    return (
      <div className="p-10">
        <h1 className="text-xl font-bold text-red-500">Routing Debug</h1>
        <p>Your resolved role is: <code>{JSON.stringify(role)}</code></p>
        <p>If you signed up as a pharmacist, something failed to save the role to your profile.</p>
        <button className="mt-4 px-4 py-2 bg-primary text-white" onClick={() => window.location.href = '/'}>Go Home</button>
      </div>
    );
  }

  // Default fallback if profile is loaded but no other role matched (implies patient)
  return <PatientDashboard />;
}

import { AlertProvider } from "@/providers/AlertProvider";
import { GlobalAlertContainer } from "@/components/layout/GlobalAlertContainer";
import { MedicineReminder } from "@/components/features/MedicineReminder";

function App() {
  return (
    <Router>
      <AlertProvider>
        <div className="min-h-screen text-foreground">
          <Navbar />
          <GlobalAlertContainer />
          <MedicineReminder />
          <main className="pt-16 min-h-screen relative">
            <Routes>
              {/* Public routes */}
              <Route
                path="/"
                element={
                  <PublicRoute>
                    <Landing />
                  </PublicRoute>
                }
              />
              <Route
                path="/login"
                element={
                  <PublicRoute>
                    <Login />
                  </PublicRoute>
                }
              />
              <Route
                path="/signup"
                element={
                  <PublicRoute>
                    <Signup />
                  </PublicRoute>
                }
              />
              <Route
                path="/reset-password"
                element={
                  <PublicRoute>
                    <ResetPassword />
                  </PublicRoute>
                }
              />
              <Route
                path="/update-password"
                element={
                  <UpdatePassword />
                }
              />

              {/* Protected routes */}
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <DashboardRouter />
                  </ProtectedRoute>
                }
              />

            {/* Patient */}
            <Route
              path="/patient/records"
              element={
                <RoleRoute allowedRole="patient">
                  <Records />
                </RoleRoute>
              }
            />
            <Route
              path="/patient/routines"
              element={
                <RoleRoute allowedRole="patient">
                  <HealthTracker />
                </RoleRoute>
              }
            />
            {/* Payment Callbacks */}
            <Route
              path="/payment/success"
              element={
                <RoleRoute allowedRole="patient">
                  <PaymentSuccess />
                </RoleRoute>
              }
            />
            <Route
              path="/payment/cancel"
              element={
                <RoleRoute allowedRole="patient">
                  <PaymentCancel />
                </RoleRoute>
              }
            />
            <Route
              path="/patient/consent"
              element={
                <RoleRoute allowedRole="patient">
                  <PatientConsent />
                </RoleRoute>
              }
            />
            <Route
              path="/patient/chat"
              element={
                <RoleRoute allowedRole="patient">
                  <Chat />
                </RoleRoute>
              }
            />
            <Route
              path="/patient/analysis"
              element={
                <RoleRoute allowedRole="patient">
                  <Analysis />
                </RoleRoute>
              }
            />

            {/* Doctor */}
            <Route
              path="/patient/pharmacy-chat"
              element={
                <RoleRoute allowedRole="patient">
                  <PharmacyChat />
                </RoleRoute>
              }
            />
            <Route
              path="/patient/my-medicines"
              element={
                <RoleRoute allowedRole="patient">
                  <MyMedicines />
                </RoleRoute>
              }
            />
            <Route
              path="/doctor/scan"
              element={
                <RoleRoute allowedRole="doctor">
                  <Scan />
                </RoleRoute>
              }
            />
            <Route
              path="/doctor/patient/:patientId"
              element={
                <RoleRoute allowedRole="doctor">
                  <PatientView />
                </RoleRoute>
              }
            />

            {/* Pharmacist */}
            <Route
              path="/pharmacist/dashboard"
              element={
                <RoleRoute allowedRole="pharmacist">
                  <PharmacistDashboard />
                </RoleRoute>
              }
            />

            <Route
              path="/hospital/dashboard"
              element={
                <RoleRoute allowedRole="hospital">
                  <HospitalDashboard />
                </RoleRoute>
              }
            />
            <Route
              path="/hospital/triage"
              element={
                <RoleRoute allowedRole="hospital">
                  <HospitalDashboard defaultTab="queue" />
                </RoleRoute>
              }
            />
            <Route
              path="/hospital/load-balancer"
              element={
                <RoleRoute allowedRole="hospital">
                  <HospitalDashboard defaultTab="resources" />
                </RoleRoute>
              }
            />

              {/* 404 */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </AlertProvider>
    </Router>
  );
}

export default App;