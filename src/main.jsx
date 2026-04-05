import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import MorphoPage from "./pages/MorphoPage";
import PendlePage from "./pages/PendlePage";
import ComparePage from "./pages/ComparePage";
import NavBar, { COLLAPSED_W } from "./components/NavBar";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <NavBar />
      <div style={{ marginLeft: COLLAPSED_W }}>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/morpho" element={<MorphoPage />} />
          <Route path="/pendle" element={<PendlePage />} />
          <Route path="/compare" element={<ComparePage />} />
        </Routes>
      </div>
    </BrowserRouter>
  </React.StrictMode>
);
