import React from "react"
import { createRoot } from "react-dom/client"
import { VariantA } from "./variants/VariantA"
import { VariantB } from "./variants/VariantB"
import { VariantF } from "./variants/VariantF"
import { FeedbackOverlay } from "./FeedbackOverlay"

const labStyles = `
  @import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap");

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: #0a0a0a;
    color: #e0e0e0;
    font-family: "Inter", -apple-system, system-ui, sans-serif;
    min-height: 100vh;
    width: 100%;
  }

  .lab-header {
    padding: 40px 40px 30px;
    border-bottom: 1px solid #222;
    max-width: 1600px;
    margin: 0 auto;
  }
  .lab-title {
    font-size: 28px; font-weight: 800; letter-spacing: -0.5px;
    margin-bottom: 6px;
  }
  .lab-title span { color: #6c5ce7; }
  .lab-subtitle {
    font-size: 13px; color: #666; max-width: 700px; line-height: 1.5;
  }
  .lab-brief {
    display: flex; gap: 20px; margin-top: 16px; flex-wrap: wrap;
  }
  .lab-brief-item {
    font-size: 11px; padding: 6px 12px; background: #161616;
    border: 1px solid #2a2a2a; border-radius: 6px;
  }
  .lab-brief-label { color: #555; letter-spacing: 1px; text-transform: uppercase; font-size: 9px; margin-bottom: 2px; }
  .lab-brief-val { color: #ccc; }

  .lab-section-title {
    font-size: 18px; font-weight: 700; margin: 40px 40px 8px;
    max-width: 1600px; margin-left: auto; margin-right: auto;
    padding: 0 40px;
  }
  .lab-section-title span { color: #6c5ce7; }
  .lab-section-desc {
    font-size: 12px; color: #555; max-width: 1600px;
    margin: 0 auto; padding: 0 40px 20px;
  }

  .lab-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 40px;
    padding: 20px 40px 40px;
    max-width: 1600px;
    margin: 0 auto;
    justify-content: center;
  }

  .lab-variant {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }

  .lab-variant-label {
    display: flex; align-items: center; gap: 10px; width: 100%;
  }
  .lab-variant-letter {
    width: 32px; height: 32px; border-radius: 8px;
    background: #6c5ce7; color: white; font-weight: 800;
    display: flex; align-items: center; justify-content: center;
    font-size: 14px;
  }
  .lab-variant-letter.winner {
    background: linear-gradient(135deg, #6c5ce7, #00cec9);
    width: 36px; height: 36px; font-size: 16px;
  }
  .lab-variant-name { font-size: 14px; font-weight: 700; }
  .lab-variant-desc { font-size: 11px; color: #666; margin-top: 2px; max-width: 380px; }

  .lab-variant-frame {
    border: 1px solid #2a2a2a;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    transition: transform 0.2s, box-shadow 0.2s;
  }
  .lab-variant-frame:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 48px rgba(0,0,0,0.6);
  }
  .lab-variant-frame.hero {
    border-color: #6c5ce7;
    box-shadow: 0 8px 32px rgba(108,92,231,0.2);
  }
  .lab-variant-frame.hero:hover {
    box-shadow: 0 12px 48px rgba(108,92,231,0.3);
  }

  .lab-divider {
    border: none; border-top: 1px solid #1a1a1a;
    margin: 20px 40px;
    max-width: 1600px;
  }

  .lab-footer {
    text-align: center; padding: 30px; color: #444; font-size: 11px;
    border-top: 1px solid #1a1a1a; margin-top: 20px;
  }
`

function DesignLab() {
  return (
    <>
      <style>{labStyles}</style>
      <div className="lab-header">
        <div className="lab-title">Design Lab: <span>SAVANTSNIPOOR</span> - Round 2</div>
        <div className="lab-subtitle">
          Synthesized variant F: B's purple/cyan style + A's wallet layout and gas info (in ETH) + stats on bottom + popup/sidebar toggle. Originals kept for comparison.
        </div>
        <div className="lab-brief">
          <div className="lab-brief-item">
            <div className="lab-brief-label">Winner</div>
            <div className="lab-brief-val">B style + A layout</div>
          </div>
          <div className="lab-brief-item">
            <div className="lab-brief-label">Fixed</div>
            <div className="lab-brief-val">Stats to bottom, ETH gas cost</div>
          </div>
          <div className="lab-brief-item">
            <div className="lab-brief-label">Added</div>
            <div className="lab-brief-val">Popup/sidebar mode toggle</div>
          </div>
          <div className="lab-brief-item">
            <div className="lab-brief-label">Stats</div>
            <div className="lab-brief-val">Hit rate, minted, balance, spent</div>
          </div>
        </div>
      </div>

      <div className="lab-section-title"><span>F</span> - Synthesized Design</div>
      <div className="lab-section-desc">
        B's style. A's gas info (base | priority | est ETH cost) and wallet rows. Footer stats rethought for multi-collection sniping. Toggle between popup and sidebar mode.
      </div>

      <div className="lab-grid">
        <div className="lab-variant" data-variant="F">
          <div className="lab-variant-label">
            <div className="lab-variant-letter winner">F</div>
            <div>
              <div className="lab-variant-name">Synthesized - Popup Mode</div>
              <div className="lab-variant-desc">400x580 popup. Click SIDEBAR toggle inside to see sidebar mode.</div>
            </div>
          </div>
          <div className="lab-variant-frame hero">
            <VariantF initialMode="popup" />
          </div>
        </div>

        <div className="lab-variant" data-variant="F">
          <div className="lab-variant-label">
            <div className="lab-variant-letter winner">F</div>
            <div>
              <div className="lab-variant-name">Synthesized - Sidebar Mode</div>
              <div className="lab-variant-desc">400x700 sidebar. Same width, more vertical room for wallet lists and activity.</div>
            </div>
          </div>
          <div className="lab-variant-frame hero">
            <VariantF initialMode="sidebar" />
          </div>
        </div>
      </div>

      <hr className="lab-divider" />

      <div className="lab-section-title">Original References</div>
      <div className="lab-section-desc">A (wallet layout + gas info source) and B (style source) kept for comparison.</div>

      <div className="lab-grid">
        <div className="lab-variant" data-variant="A">
          <div className="lab-variant-label">
            <div className="lab-variant-letter">A</div>
            <div>
              <div className="lab-variant-name">Surgical Precision</div>
              <div className="lab-variant-desc">Source for wallet layout and gas info row.</div>
            </div>
          </div>
          <div className="lab-variant-frame">
            <VariantA />
          </div>
        </div>

        <div className="lab-variant" data-variant="B">
          <div className="lab-variant-label">
            <div className="lab-variant-letter">B</div>
            <div>
              <div className="lab-variant-name">Side Panel Command</div>
              <div className="lab-variant-desc">Source for overall style and purple/cyan palette.</div>
            </div>
          </div>
          <div className="lab-variant-frame">
            <VariantB />
          </div>
        </div>
      </div>

      <div className="lab-footer">
        SAVANTSNIPOOR Design Lab Round 2 | Click "Add Feedback" to annotate | Toggle popup/sidebar within F
      </div>

      <FeedbackOverlay targetName="SAVANTSNIPOOR Extension" />
    </>
  )
}

createRoot(document.getElementById("root")!).render(<DesignLab />)
