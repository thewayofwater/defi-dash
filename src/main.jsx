import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import AavePage from "./pages/AavePage";
import MorphoPage from "./pages/MorphoPage";
import PendlePage from "./pages/PendlePage";
import ComparePage from "./pages/ComparePage";
import PortfolioPage from "./pages/PortfolioPage";
import MaplePage from "./pages/MaplePage";
import HyperliquidPage from "./pages/HyperliquidPage";
import SparklendPage from "./pages/SparklendPage";
import GovernancePage from "./pages/GovernancePage";
import NavBar, { COLLAPSED_W } from "./components/NavBar";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <NavBar />
      <div style={{ marginLeft: COLLAPSED_W }}>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/aave" element={<AavePage />} />
          <Route path="/morpho" element={<MorphoPage />} />
          <Route path="/pendle" element={<PendlePage />} />
          <Route path="/maple" element={<MaplePage />} />
          <Route path="/hyperliquid" element={<HyperliquidPage />} />
          <Route path="/sparklend" element={<SparklendPage />} />
          <Route path="/governance" element={<GovernancePage />} />
          <Route path="/compare" element={<ComparePage />} />
          <Route path="/portfolio" element={<PortfolioPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  </React.StrictMode>
);
