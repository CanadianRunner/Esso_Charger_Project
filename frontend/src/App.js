import React from "react";
import ThisSaleDisplay from "./components/ThisSaleDisplay";
import LifetimeAndMonthlyKWh from "./components/LifeTimeAndMonthlyKWH";
import PowerAndElapsedTime from "./components/PowerAndElapsedTime";
import DeliveredEnergy from "./components/DeliveredEnergy";
import EnergyPrice from "./components/EnergyPrice";
import "./App.css";

function App() {
  const lifetimeMetrics = [
    { icon: "📅", value: "456.78" },  // Monthly usage
    { icon: "∞", value: "12345.67" }, // Lifetime usage
  ];

  const powerMetrics = [
    { icon: "⚡", value: "11.5" },     // Current power
    { icon: "⏱️", value: "01:15:32" }, // Elapsed time
  ];

  return (
    <div className="App">
      <ThisSaleDisplay cost={23.76} />
      <LifetimeAndMonthlyKWh metrics={lifetimeMetrics} />
      <PowerAndElapsedTime metrics={powerMetrics} />

      <div className="nested-metrics">
        <DeliveredEnergy kWh={5.75} />
        <EnergyPrice price={0.13} />
      </div>
    </div>
  );
}

export default App;
