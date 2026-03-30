import AlertsPage from "./pages/AlertsPage";
import DashboardPage from "./pages/DashboardPage";
import Layout from "./components/Layout";
import SensorDetailPage from "./pages/SensorDetailPage";
import SuppressionPage from "./pages/SuppressionPage";
import { Route, Routes } from "react-router-dom";
import { AuthProvider } from "./AuthContext";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/sensors/:sensorId" element={<SensorDetailPage />} />
          <Route path="/suppression" element={<SuppressionPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  )
}
