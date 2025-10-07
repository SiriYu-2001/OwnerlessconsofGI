document.addEventListener('DOMContentLoaded', function () {
    // --- DOM Elements ---
    const pages = document.querySelectorAll('.page');
    const tabButtons = document.querySelectorAll('.tab-button');
    const loaderOverlay = document.getElementById('loader-overlay');
    
    // Historical Page Elements
    const runHistoricalSimBtn = document.getElementById('run-historical-sim');
    const historicalResultsDiv = document.getElementById('historical-results');
    const historicalStatsDiv = document.getElementById('historical-stats');
    const historicalBreakdownTableBody = document.querySelector('#historical-breakdown-table tbody');

    // Future Page Elements
    const runFutureSimBtn = document.getElementById('run-future-sim');
    const consGrid = document.getElementById('current-cons-grid');
    const futureResultsDiv = document.getElementById('future-results');

    let historicalChartInstance = null;
    let futureChartInstance = null;

    // --- Constants ---
    const FULL_CONSTELLATION = 7; // C6 + base character
    const PATCHES_PER_YEAR = 9;

    const HISTORICAL_PHASES = [
        { name: '1.0-2.8', patches: 17, startVersion: 1.0, chars: 5, offBannerRate: 0.5 },
        { name: '3.0-3.4', patches: 5, startVersion: 3.0, chars: 6, offBannerRate: 0.5 },
        { name: '3.5-4.8', patches: 12, startVersion: 3.5, chars: 7, offBannerRate: 0.5 },
        { name: '5.0-5.3', patches: 4, startVersion: 5.0, chars: 7, offBannerRate: 0.45 },
        { name: '5.4-Present', patches: 5, startVersion: 5.4, chars: 8, offBannerRate: 0.45 }
    ];
    
    const STANDARD_CHARS_BY_VERSION = {
        5: ['Diluc', 'Jean', 'Mona', 'Qiqi', 'Keqing'],
        6: ['Diluc', 'Jean', 'Mona', 'Qiqi', 'Keqing', 'Tighnari'],
        7: ['Diluc', 'Jean', 'Mona', 'Qiqi', 'Keqing', 'Tighnari', 'Dehya'],
        8: ['Diluc', 'Jean', 'Mona', 'Qiqi', 'Keqing', 'Tighnari', 'Dehya', 'Mizuki'],
        9: ['Diluc', 'Jean', 'Mona', 'Qiqi', 'Keqing', 'Tighnari', 'Dehya', 'Mizuki', 'FutureChar1'],
        10: ['Diluc', 'Jean', 'Mona', 'Qiqi', 'Keqing', 'Tighnari', 'Dehya', 'Mizuki', 'FutureChar1', 'FutureChar2'],
        11: ['Diluc', 'Jean', 'Mona', 'Qiqi', 'Keqing', 'Tighnari', 'Dehya', 'Mizuki', 'FutureChar1', 'FutureChar2', 'FutureChar3'],
        12: ['Diluc', 'Jean', 'Mona', 'Qiqi', 'Keqing', 'Tighnari', 'Dehya', 'Mizuki', 'FutureChar1', 'FutureChar2', 'FutureChar3', 'FutureChar4'],
        13: ['Diluc', 'Jean', 'Mona', 'Qiqi', 'Keqing', 'Tighnari', 'Dehya', 'Mizuki', 'FutureChar1', 'FutureChar2', 'FutureChar3', 'FutureChar4', 'FutureChar5'],
    };
    const CURRENT_STANDARD_CHARS = STANDARD_CHARS_BY_VERSION[8];

    // --- UI Logic ---
    window.showTab = (tabId) => {
        pages.forEach(page => page.classList.remove('active'));
        tabButtons.forEach(btn => btn.classList.remove('active'));
        document.getElementById(tabId).classList.add('active');
        document.getElementById(`tab-${tabId.slice(0,4)}`).classList.add('active');
    };

    function populateConstellationGrid() {
        consGrid.innerHTML = '';
        CURRENT_STANDARD_CHARS.forEach(char => {
            const div = document.createElement('div');
            div.className = 'input-group';
            div.innerHTML = `
                <label for="cons-${char}">${char}:</label>
                <input type="number" id="cons-${char}" value="0" min="-1" max="7" title="Enter -1 if not owned, 0 for C0, 6 for C6.">
            `;
            consGrid.appendChild(div);
        });
    }

    // --- Gacha Simulation Core Logic ---
    function get5StarProb(pity) {
        if (pity <= 73) return 0.006;
        if (pity >= 90) return 1.0;
        return (60 + 600 * (pity - 73)) / 10000;
    }

    function findTargetCharacter(constellations, strategy, pool) {
        if (!pool || pool.length === 0) return null;
        
        let relevantCons = pool.map(char => constellations[char]);
        let targetValue = strategy === 'lowest' ? Math.min(...relevantCons) : Math.max(...relevantCons);
        const candidates = pool.filter(char => constellations[char] === targetValue);
        return candidates[Math.floor(Math.random() * candidates.length)];
    }

    function simulatePullLimited(state, offBannerRate) {
        state.pity++;
        if (Math.random() < get5StarProb(state.pity)) {
            state.pity = 0;
            if (state.isGuaranteed || Math.random() >= offBannerRate) {
                state.isGuaranteed = false;
            } else {
                state.isGuaranteed = true;
                const pool = STANDARD_CHARS_BY_VERSION[state.charPoolSize];
                const wonChar = pool[Math.floor(Math.random() * pool.length)];
                state.constellations[wonChar]++;
            }
        }
    }

    function simulatePullStandard(state) {
        state.pity++;
        state.charPity++;
        state.wepPity++;

        if (Math.random() < get5StarProb(state.pity)) {
            state.pity = 0;
            const wChar = (state.charPity <= 146) ? 30 : 30 + 300 * (state.charPity - 146);
            const wWep = (state.wepPity <= 146) ? 30 : 30 + 300 * (state.wepPity - 146);
            
            if (Math.random() < wChar / (wChar + wWep)) {
                state.charPity = 0;
                const pool = STANDARD_CHARS_BY_VERSION[state.charPoolSize];
                const wonChar = pool[Math.floor(Math.random() * pool.length)];
                state.constellations[wonChar]++;
            } else {
                state.wepPity = 0;
            }
        }
    }
    
    // --- Main Simulation Functions ---

    function runHistoricalSimulation() {
        loaderOverlay.classList.remove('hidden');
        historicalResultsDiv.classList.add('hidden');

        setTimeout(() => {
            const SIMULATION_RUNS = parseInt(document.getElementById('hist-simulation-runs').value);
            const inputs = {
                limitedPulls: [
                    parseFloat(document.getElementById('hist-limited-1').value), parseFloat(document.getElementById('hist-limited-2').value),
                    parseFloat(document.getElementById('hist-limited-3').value), parseFloat(document.getElementById('hist-limited-4').value),
                    parseFloat(document.getElementById('hist-limited-5').value),
                ],
                standardPulls: [
                    parseFloat(document.getElementById('hist-standard-1').value), parseFloat(document.getElementById('hist-standard-2').value),
                    parseFloat(document.getElementById('hist-standard-3').value), parseFloat(document.getElementById('hist-standard-4').value),
                    parseFloat(document.getElementById('hist-standard-5').value),
                ],
                extraConsPerYear: parseInt(document.getElementById('hist-extra-cons').value),
                strategy: document.getElementById('hist-constellation-strategy').value
            };

            const overflowResults = [];
            const charStats = Object.fromEntries(CURRENT_STANDARD_CHARS.map(c => [c, { totalCopies: 0, totalOverflows: 0 }]));

            for (let i = 0; i < SIMULATION_RUNS; i++) {
                const state = {
                    pity: 0, isGuaranteed: false,
                    constellations: Object.fromEntries(CURRENT_STANDARD_CHARS.map(c => [c, 0])),
                    receivedOneTimeBonus: new Set(), // NEW: Track one-time bonuses
                };
                const standardState = {
                    pity: 0, charPity: 0, wepPity: 0,
                    constellations: state.constellations,
                };

                HISTORICAL_PHASES.forEach((phase, index) => {
                    state.charPoolSize = phase.chars;
                    standardState.charPoolSize = phase.chars;
                    const currentPool = STANDARD_CHARS_BY_VERSION[phase.chars];

                    const totalLimitedPulls = Math.round(phase.patches * inputs.limitedPulls[index]);
                    const totalStandardPulls = Math.round(phase.patches * inputs.standardPulls[index]);

                    for (let p = 0; p < totalLimitedPulls; p++) simulatePullLimited(state, phase.offBannerRate);
                    for (let p = 0; p < totalStandardPulls; p++) simulatePullStandard(standardState);
                    
                    const yearsInPhase = Math.floor(phase.patches / PATCHES_PER_YEAR);
                    if (yearsInPhase > 0) {
                        for (let y = 0; y < yearsInPhase; y++) {
                            // Logic for +1 self-select (always happens after 5.0)
                            if (phase.startVersion >= 5.0) {
                                const targetChar = findTargetCharacter(state.constellations, inputs.strategy, currentPool);
                                if(targetChar) state.constellations[targetChar]++;
                            }
                            // Logic for +x one-time bonus (only after 6.0)
                            if (phase.startVersion >= 6.0 && inputs.extraConsPerYear > 0) {
                                let eligibleForXBonus = currentPool.filter(char => !state.receivedOneTimeBonus.has(char));
                                const numBonusesToGive = Math.min(inputs.extraConsPerYear, eligibleForXBonus.length);

                                for (let k = 0; k < numBonusesToGive; k++) {
                                    const targetChar = findTargetCharacter(state.constellations, inputs.strategy, eligibleForXBonus);
                                    if(targetChar) {
                                        state.constellations[targetChar]++;
                                        state.receivedOneTimeBonus.add(targetChar);
                                        // Remove from this year's eligibility list
                                        eligibleForXBonus = eligibleForXBonus.filter(c => c !== targetChar);
                                    }
                                }
                            }
                        }
                    }
                });
                
                let totalOverflow = 0;
                CURRENT_STANDARD_CHARS.forEach(char => {
                    const copies = state.constellations[char];
                    const overflow = Math.max(0, copies - FULL_CONSTELLATION);
                    totalOverflow += overflow;
                    charStats[char].totalCopies += copies;
                    charStats[char].totalOverflows += overflow;
                });
                overflowResults.push(totalOverflow);
            }
            
            historicalResultsDiv.classList.remove('hidden');
            drawHistogram(overflowResults, SIMULATION_RUNS);
            calculateAndDisplayStats(overflowResults);
            displayCharacterBreakdown(charStats, SIMULATION_RUNS);
            loaderOverlay.classList.add('hidden');
        }, 50);
    }
    
    function runFutureSimulation() {
        loaderOverlay.classList.remove('hidden');
        futureResultsDiv.classList.add('hidden');

        setTimeout(() => {
            const SIMULATION_RUNS = parseInt(document.getElementById('future-simulation-runs').value);
            const initialConstellations = {};
            CURRENT_STANDARD_CHARS.forEach(char => {
                const val = parseInt(document.getElementById(`cons-${char}`).value);
                initialConstellations[char] = (val === -1) ? 0 : val + 1;
            });

            const inputs = {
                initialCons: initialConstellations,
                limitedPity: parseInt(document.getElementById('future-limited-pity').value),
                isGuaranteed: document.getElementById('future-limited-guarantee').value === 'true',
                standardPity: parseInt(document.getElementById('future-standard-pity').value),
                charPity: parseInt(document.getElementById('future-standard-char-pity').value),
                wepPity: parseInt(document.getElementById('future-standard-wep-pity').value),
                limitedPullsPerPatch: parseFloat(document.getElementById('future-limited-pulls').value),
                standardPullsPerPatch: parseFloat(document.getElementById('future-standard-pulls').value),
                extraConsPerYear: parseInt(document.getElementById('future-extra-cons').value),
                strategy: document.getElementById('future-constellation-strategy').value
            };

            const resultsByYear = { 1: [], 2: [], 3: [], 4: [], 5: [] };
            const fullCharPool = STANDARD_CHARS_BY_VERSION[13];

            for (let i = 0; i < SIMULATION_RUNS; i++) {
                let initialConsWithFuture = { ...inputs.initialCons };
                fullCharPool.forEach(c => { if (!initialConsWithFuture[c]) initialConsWithFuture[c] = 0; });

                let state = {
                    pity: inputs.limitedPity, isGuaranteed: inputs.isGuaranteed,
                    constellations: { ...initialConsWithFuture },
                    receivedOneTimeBonus: new Set(), // Starts empty for future prediction
                };
                let standardState = {
                    pity: inputs.standardPity, charPity: inputs.charPity, wepPity: inputs.wepPity,
                    constellations: state.constellations
                };

                for (let year = 1; year <= 5; year++) {
                    state.charPoolSize = 8 + (year - 1);
                    standardState.charPoolSize = state.charPoolSize;
                    const currentPool = STANDARD_CHARS_BY_VERSION[state.charPoolSize];
                    
                    // Handle +1 self-select
                    const targetCharSelect = findTargetCharacter(state.constellations, inputs.strategy, currentPool);
                    if (targetCharSelect) state.constellations[targetCharSelect]++;
                    
                    // Handle +x one-time bonus
                    if (inputs.extraConsPerYear > 0) {
                        let eligibleForXBonus = currentPool.filter(char => !state.receivedOneTimeBonus.has(char));
                        const numBonusesToGive = Math.min(inputs.extraConsPerYear, eligibleForXBonus.length);

                        for (let k = 0; k < numBonusesToGive; k++) {
                            const targetChar = findTargetCharacter(state.constellations, inputs.strategy, eligibleForXBonus);
                            if(targetChar) {
                                state.constellations[targetChar]++;
                                state.receivedOneTimeBonus.add(targetChar);
                                eligibleForXBonus = eligibleForXBonus.filter(c => c !== targetChar);
                            }
                        }
                    }

                    for (let p = 0; p < PATCHES_PER_YEAR; p++) {
                        for (let lp = 0; lp < inputs.limitedPullsPerPatch; lp++) simulatePullLimited(state, 0.45);
                        for (let sp = 0; sp < inputs.standardPullsPerPatch; sp++) simulatePullStandard(standardState);
                    }
                    
                    const totalOverflow = Object.values(state.constellations).reduce((sum, cons) => sum + Math.max(0, cons - FULL_CONSTELLATION), 0);
                    resultsByYear[year].push(totalOverflow);
                }
            }
            
            futureResultsDiv.classList.remove('hidden');
            drawFutureCharts(resultsByYear, SIMULATION_RUNS);
            loaderOverlay.classList.add('hidden');

        }, 50);
    }

    // --- Charting & Stats Functions ---
    function calculateAndDisplayStats(results) {
        const n = results.length;
        if (n === 0) return;
        const mean = results.reduce((a, b) => a + b, 0) / n;
        const variance = results.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
        const stdDev = Math.sqrt(variance);

        historicalStatsDiv.innerHTML = `
            <div>溢出命星期望 (Mean Overflow)<span class="stat-value">${mean.toFixed(2)}</span></div>
            <div>溢出命星标准差 (Std Dev)<span class="stat-value">${stdDev.toFixed(2)}</span></div>
        `;
    }

    function displayCharacterBreakdown(charStats, runs) {
        historicalBreakdownTableBody.innerHTML = '';
        CURRENT_STANDARD_CHARS.forEach(char => {
            const stats = charStats[char];
            const avgCopies = stats.totalCopies / runs;
            const avgOverflow = stats.totalOverflows / runs;
            const row = `
                <tr>
                    <td>${char}</td>
                    <td>${avgCopies.toFixed(2)}</td>
                    <td>${avgOverflow.toFixed(2)}</td>
                </tr>
            `;
            historicalBreakdownTableBody.innerHTML += row;
        });
    }
    
    function drawHistogram(results, simulationRuns) {
        if (historicalChartInstance) historicalChartInstance.destroy();
        const counts = {};
        results.forEach(res => { counts[res] = (counts[res] || 0) + 1; });
        const labels = Object.keys(counts).map(Number).sort((a, b) => a - b);
        const data = labels.map(label => (counts[label] / simulationRuns) * 100);

        const ctx = document.getElementById('historical-chart').getContext('2d');
        historicalChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: '概率 (Probability %)',
                    data: data,
                    backgroundColor: 'rgba(74, 144, 226, 0.6)',
                    borderColor: 'rgba(74, 144, 226, 1)',
                    borderWidth: 1
                }]
            },
            options: { scales: { y: { beginAtZero: true, title: { display: true, text: '概率 (%)' } }, x: { title: { display: true, text: '总溢出命星数 (Total Overflow Constellations)' } } },
                plugins: { tooltip: { callbacks: { label: (c) => `概率: ${c.raw.toFixed(2)}%` } } }
            }
        });
    }

    function drawFutureCharts(resultsByYear, simulationRuns) {
        if (futureChartInstance) futureChartInstance.destroy();
        const labels = Object.keys(resultsByYear);
        const [medianData, lowerBoundData, upperBoundData] = [[], [], []];

        labels.forEach(year => {
            const sortedResults = [...resultsByYear[year]].sort((a, b) => a - b);
            medianData.push(sortedResults[Math.floor(simulationRuns * 0.5)]);
            lowerBoundData.push(sortedResults[Math.floor(simulationRuns * 0.025)]);
            upperBoundData.push(sortedResults[Math.floor(simulationRuns * 0.975)]);
        });
        
        const ctx = document.getElementById('future-chart').getContext('2d');
        futureChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels.map(y => `第${y}年 (Year ${y})`),
                datasets: [
                    { label: '中位数 (Median)', data: medianData, borderColor: 'rgba(74, 144, 226, 1)', fill: false, tension: 0.1 },
                    { label: '95% 置信区间 (95% CI)', data: upperBoundData, borderColor: 'rgba(200, 200, 200, 0.2)', backgroundColor: 'rgba(74, 144, 226, 0.2)', fill: '-1', pointRadius: 0 },
                    { label: 'Lower Bound (hidden)', data: lowerBoundData, borderColor: 'rgba(200, 200, 200, 0.2)', fill: false, pointRadius: 0 }
                ]
            },
            options: {
                 scales: { y: { beginAtZero: true, title: { display: true, text: '总溢出命星数 (Total Overflow Constellations)' } } },
                plugins: { legend: { labels: { filter: (item) => !item.text.includes('hidden') } } }
            }
        });
    }

    // --- Initial Setup ---
    populateConstellationGrid();
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
             const pageId = button.getAttribute('data-page');
             showTab(pageId);
        });
    });
    // Correctly bind tab switching
    document.getElementById('tab-hist').addEventListener('click', () => showTab('historical'));
    document.getElementById('tab-future').addEventListener('click', () => showTab('future'));

    runHistoricalSimBtn.addEventListener('click', runHistoricalSimulation);
    runFutureSimBtn.addEventListener('click', runFutureSimulation);
});