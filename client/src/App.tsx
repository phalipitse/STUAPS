import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { InstitutionProvider } from "./institutions/InstitutionContext";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { ForgotPassword } from "./pages/ForgotPassword";
import { Dashboard } from "./pages/Dashboard";
import { Institutions } from "./pages/Institutions";
import { Properties } from "./pages/Properties";
import { Invoices } from "./pages/Invoices";
import { InvoiceDetail } from "./pages/InvoiceDetail";
import { Students } from "./pages/Students";
import { Outstanding } from "./pages/Outstanding";
import { Admin } from "./pages/Admin";
import { Team } from "./pages/Team";
import { Billing } from "./pages/Billing";
import { EmailInbox } from "./pages/EmailInbox";
import { FinancialStatements } from "./pages/FinancialStatements";
import { Payroll } from "./pages/Payroll";
import { PayslipDetail } from "./pages/PayslipDetail";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="page">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <InstitutionProvider>
              <Layout />
            </InstitutionProvider>
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="institutions" element={<Institutions />} />
        <Route path="properties" element={<Properties />} />
        <Route path="invoices" element={<Invoices />} />
        <Route path="invoices/:id" element={<InvoiceDetail />} />
        <Route path="students" element={<Students />} />
        <Route path="outstanding" element={<Outstanding />} />
        <Route path="admin" element={<Admin />} />
        <Route path="team" element={<Team />} />
        <Route path="billing" element={<Billing />} />
        <Route path="email-inbox" element={<EmailInbox />} />
        <Route path="financial-statements" element={<FinancialStatements />} />
        <Route path="payroll" element={<Payroll />} />
        <Route path="payroll/payslips/:id" element={<PayslipDetail />} />
      </Route>
    </Routes>
  );
}
