// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import PlantDiseaseApp from "./PlantDiseaseApp.jsx";
import "./index.css"; // Thêm dòng này để load Tailwind

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <PlantDiseaseApp />
  </React.StrictMode>
);