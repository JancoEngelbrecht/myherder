const { v4: uuidv4 } = require('uuid');

const DEFAULT_FARM_ID = '00000000-0000-4000-a000-000000000099';

/**
 * Demo analytics seed — generates ~2 years of realistic farm data
 * for milk records, health issues, and treatments so the analytics
 * dashboard has interesting charts to display.
 *
 * Run with: npm run seed
 * Safe to re-run: clears only the tables it populates (milk_records,
 * health_issues, treatments) then re-inserts.
 */
exports.seed = async function (knex) {
  const isSQLite = knex.client.config.client === 'better-sqlite3'
  // ── Wipe existing demo data ──────────────────────────────────────────────
  await knex('treatment_medications').del();
  await knex('treatments').del();
  await knex('health_issues').del();
  await knex('milk_records').del();

  // ── Lookups ──────────────────────────────────────────────────────────────

  const adminRow = await knex('users').where('username', 'admin').first();
  const workerRow = await knex('users').where('username', 'sipho').first();
  const adminId = adminRow.id;
  const workerId = workerRow.id;
  const reporters = [adminId, workerId];

  // Milkable cows: match the daily-kpis "expected" criteria (active/pregnant, not dry)
  const milkingCows = await knex('cows')
    .whereNull('deleted_at')
    .where('sex', 'female')
    .whereIn('status', ['active', 'pregnant'])
    .where('is_dry', false)
    .select('id', 'tag_number', 'name', 'breed', 'status');

  const allFemaleCows = await knex('cows')
    .whereNull('deleted_at')
    .where('sex', 'female')
    .whereNotIn('status', ['sold', 'dead'])
    .select('id', 'tag_number', 'breed', 'status');

  const medications = await knex('medications').select('id', 'name', 'withdrawal_milk_hours', 'withdrawal_meat_days');
  const medMap = {};
  medications.forEach(m => { medMap[m.name] = m; });

  // ── Helpers ──────────────────────────────────────────────────────────────

  function isoDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function isoDatetime(d) {
    const date = isoDate(d);
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    return `${date} ${h}:${min}:${s}`;
  }
  function rand(min, max) { return Math.random() * (max - min) + min; }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function seededJitter(base, pct) { return base * (1 + (Math.random() - 0.5) * 2 * pct); }

  // South African seasons affect milk production:
  // Summer (Nov-Feb): good grazing, peak milk
  // Autumn (Mar-Apr): declining
  // Winter (May-Aug): low production, more health issues
  // Spring (Sep-Oct): recovering
  function seasonalMilkFactor(month) {
    //                  Jan   Feb   Mar   Apr   May   Jun   Jul   Aug   Sep   Oct   Nov   Dec
    const factors = [0, 1.10, 1.12, 1.05, 0.95, 0.85, 0.78, 0.75, 0.80, 0.90, 0.98, 1.05, 1.08];
    return factors[month] || 1.0;
  }

  // Breed-specific base daily litres (per session — 2 sessions/day)
  function breedBaseLitres(breed) {
    switch (breed) {
      case 'Holstein':  return rand(12, 16); // high producers
      case 'Jersey':    return rand(8, 12);  // less volume, richer milk
      case 'Ayrshire':  return rand(10, 13);
      case 'Nguni':     return rand(4, 7);   // dual-purpose, lower yield
      case 'Brahman':   return rand(3, 5);   // beef breed, minimal milking
      default:          return rand(8, 12);
    }
  }

  // ── Date range: 2 years back from today ──────────────────────────────────

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDate = new Date(today);
  startDate.setFullYear(startDate.getFullYear() - 2);

  // ── Generate milk records ────────────────────────────────────────────────
  // ~30-50 cows milked daily, morning + afternoon, for ~730 days

  const milkRecords = [];
  const cowMilkBase = {};  // per-cow base production for consistency

  for (const cow of milkingCows) {
    cowMilkBase[cow.id] = breedBaseLitres(cow.breed);
  }

  // Track which cows are on withdrawal (for discarded milk)
  const cowWithdrawalEnd = {};  // cow_id -> Date when withdrawal ends

  const cursor = new Date(startDate);
  while (cursor <= today) {
    const month = cursor.getMonth() + 1;
    const seasonFactor = seasonalMilkFactor(month);
    const dateStr = isoDate(cursor);

    for (const cow of milkingCows) {
      // Skip: dry cows rarely milked, others almost always milked
      const skipChance = cow.status === 'dry' ? 0.85 : 0.01;
      if (Math.random() < skipChance) continue;

      const baseLitres = cowMilkBase[cow.id];

      // Morning session (typically higher yield)
      const morningLitres = Math.round(seededJitter(baseLitres * 0.55 * seasonFactor, 0.15) * 100) / 100;
      const afternoonLitres = Math.round(seededJitter(baseLitres * 0.45 * seasonFactor, 0.15) * 100) / 100;

      // Check if milk should be discarded (cow on withdrawal)
      // Note: cowWithdrawalEnd is populated after treatments are generated,
      // so during initial milk gen this is always false. We fix discards via SQL later.
      const onWithdrawal = !!(cowWithdrawalEnd[cow.id] && cursor <= cowWithdrawalEnd[cow.id]);

      if (morningLitres > 0) {
        milkRecords.push({
          id: uuidv4(),
          farm_id: DEFAULT_FARM_ID,
          cow_id: cow.id,
          recorded_by: pick(reporters),
          session: 'morning',
          litres: Math.max(0.5, morningLitres),
          recording_date: dateStr,
          milk_discarded: onWithdrawal ? 1 : 0,
          discard_reason: onWithdrawal ? 'Withdrawal period — antibiotics' : null,
          created_at: isoDatetime(cursor),
          updated_at: isoDatetime(cursor),
        });
      }

      if (afternoonLitres > 0) {
        milkRecords.push({
          id: uuidv4(),
          farm_id: DEFAULT_FARM_ID,
          cow_id: cow.id,
          recorded_by: pick(reporters),
          session: 'afternoon',
          litres: Math.max(0.5, afternoonLitres),
          recording_date: dateStr,
          milk_discarded: onWithdrawal ? 1 : 0,
          discard_reason: onWithdrawal ? 'Withdrawal period — antibiotics' : null,
          created_at: isoDatetime(cursor),
          updated_at: isoDatetime(cursor),
        });
      }
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  // Insert in batches (SQLite has variable limits)
  for (let i = 0; i < milkRecords.length; i += 100) {
    await knex.batchInsert('milk_records', milkRecords.slice(i, i + 100), 100);
  }

  // ── Generate health issues ───────────────────────────────────────────────
  // Seasonal patterns:
  //   - Mastitis: year-round but peaks in winter (wet, muddy conditions)
  //   - Lameness: peaks in wet months (May-Aug)
  //   - Respiratory: winter peak (Jun-Aug)
  //   - Digestive: spring flush (Sep-Oct) when pasture changes
  //   - Fever: follows infections, year-round
  //   - Eye: summer (flies), Dec-Feb
  //   - Calving complications: follows calving season

  const issueTypes = [
    { code: 'mastitis',     baseProb: 0.025, seasonal: [0, 0.7, 0.6, 0.8, 1.0, 1.4, 1.6, 1.8, 1.5, 1.0, 0.8, 0.7, 0.7] },
    { code: 'lameness',     baseProb: 0.015, seasonal: [0, 0.6, 0.5, 0.7, 0.9, 1.3, 1.5, 1.4, 1.2, 0.9, 0.7, 0.6, 0.6] },
    { code: 'respiratory',  baseProb: 0.010, seasonal: [0, 0.4, 0.4, 0.5, 0.7, 1.2, 1.6, 1.8, 1.4, 0.8, 0.5, 0.4, 0.4] },
    { code: 'digestive',    baseProb: 0.008, seasonal: [0, 0.6, 0.5, 0.7, 0.8, 0.9, 0.8, 0.8, 0.9, 1.5, 1.6, 1.0, 0.7] },
    { code: 'fever',        baseProb: 0.006, seasonal: [0, 0.8, 0.7, 0.8, 0.9, 1.2, 1.4, 1.3, 1.1, 0.9, 0.8, 0.7, 0.8] },
    { code: 'eye',          baseProb: 0.005, seasonal: [0, 1.5, 1.6, 1.3, 0.8, 0.5, 0.4, 0.4, 0.5, 0.8, 1.0, 1.3, 1.5] },
    { code: 'bad_milk',     baseProb: 0.004, seasonal: [0, 0.8, 0.7, 0.8, 1.0, 1.3, 1.5, 1.4, 1.2, 0.9, 0.8, 0.7, 0.8] },
  ];

  const severities = ['low', 'medium', 'high'];
  const severityWeights = [0.3, 0.5, 0.2];
  function pickSeverity() {
    const r = Math.random();
    if (r < severityWeights[0]) return severities[0];
    if (r < severityWeights[0] + severityWeights[1]) return severities[1];
    return severities[2];
  }

  const teats = ['front_left', 'front_right', 'rear_left', 'rear_right'];
  function randomTeats() {
    const count = Math.random() < 0.6 ? 1 : Math.random() < 0.8 ? 2 : 3;
    const shuffled = [...teats].sort(() => Math.random() - 0.5);
    return JSON.stringify(shuffled.slice(0, count));
  }

  const healthIssues = [];
  const healthIssueIndex = {}; // id -> issue (for linking treatments)

  // Walk through each week of the 2-year period
  const weekCursor = new Date(startDate);
  while (weekCursor <= today) {
    const month = weekCursor.getMonth() + 1;

    for (const cow of allFemaleCows) {
      for (const it of issueTypes) {
        // Weekly probability per cow per issue type
        const prob = it.baseProb * (it.seasonal[month] || 1.0);

        if (Math.random() < prob) {
          // Generate an issue on a random day within this week
          const dayOffset = Math.floor(Math.random() * 7);
          const issueDate = new Date(weekCursor);
          issueDate.setDate(issueDate.getDate() + dayOffset);
          if (issueDate > today) continue;

          const severity = pickSeverity();
          const needsTeats = (it.code === 'mastitis' || it.code === 'bad_milk');

          // Resolve most issues, leave recent ones open
          const daysOld = Math.floor((today - issueDate) / 86400000);
          let status = 'resolved';
          let resolvedAt = null;
          if (daysOld < 7) {
            status = Math.random() < 0.4 ? 'open' : 'treating';
          } else if (daysOld < 21) {
            status = Math.random() < 0.15 ? 'treating' : 'resolved';
          }
          if (status === 'resolved') {
            const resolveDate = new Date(issueDate);
            resolveDate.setDate(resolveDate.getDate() + Math.floor(rand(3, 14)));
            resolvedAt = isoDatetime(resolveDate > today ? today : resolveDate);
          }

          const issue = {
            id: uuidv4(),
            farm_id: DEFAULT_FARM_ID,
            cow_id: cow.id,
            reported_by: pick(reporters),
            issue_types: JSON.stringify([it.code]),
            severity,
            affected_teats: needsTeats ? randomTeats() : null,
            description: null,
            observed_at: isoDatetime(issueDate),
            status,
            resolved_at: resolvedAt,
            created_at: isoDatetime(issueDate),
            updated_at: isoDatetime(issueDate),
          };

          healthIssues.push(issue);
          healthIssueIndex[issue.id] = { ...issue, issueCode: it.code, issueDate };
        }
      }
    }

    weekCursor.setDate(weekCursor.getDate() + 7);
  }

  for (let i = 0; i < healthIssues.length; i += 100) {
    await knex.batchInsert('health_issues', healthIssues.slice(i, i + 100), 100);
  }

  // ── Generate treatments ──────────────────────────────────────────────────
  // Most health issues get at least one treatment.
  // Mastitis → intramammary tube or penicillin
  // Lameness → flunixin (NSAID) + sometimes oxy
  // Respiratory → oxytetracycline
  // Fever → flunixin + penicillin
  // Eye → oxytetracycline eye ointment (we'll use oxy)
  // Digestive → B-vitamins supportive
  // Bad milk → intramammary tube

  const treatmentMap = {
    mastitis:    ['Mastitis Intramammary Tube', 'Penicillin G'],
    lameness:    ['Flunixin Meglumine (Banamine)', 'Oxytetracycline 200mg/ml'],
    respiratory: ['Oxytetracycline 200mg/ml', 'Flunixin Meglumine (Banamine)'],
    digestive:   ['Vitamins B-complex'],
    fever:       ['Flunixin Meglumine (Banamine)', 'Penicillin G'],
    eye:         ['Oxytetracycline 200mg/ml'],
    bad_milk:    ['Mastitis Intramammary Tube'],
  };

  // Cost ranges by medication (ZAR)
  const costRanges = {
    'Penicillin G':                    [25, 60],
    'Oxytetracycline 200mg/ml':        [45, 90],
    'Flunixin Meglumine (Banamine)':   [80, 150],
    'Mastitis Intramammary Tube':      [55, 95],
    'Vitamins B-complex':              [15, 35],
  };

  // Sample treatment notes per issue type
  const treatmentNotes = {
    mastitis:    ['Swelling in affected quarter', 'Milk clots observed', 'Repeat treatment after 48h', 'Mild case, responding well', 'SCC test elevated'],
    lameness:    ['Hoof trimmed and cleaned', 'Abscess drained', 'Swelling in left rear', 'Improving after 2 days', 'Stone bruise on sole'],
    respiratory: ['Nasal discharge, laboured breathing', 'Coughing for 3 days', 'Isolated from herd', 'Temperature 40.2°C', 'Mild pneumonia suspected'],
    digestive:   ['Off feed for 2 days', 'Rumen sounds reduced', 'Possible grain overload', 'Appetite returning'],
    fever:       ['Temperature 40.5°C', 'Lethargic, not eating', 'Monitor overnight', 'Responded well to treatment'],
    eye:         ['Pinkeye, left eye cloudy', 'Tearing and swelling', 'Fly irritation likely cause', 'Eye patch applied'],
    bad_milk:    ['Abnormal milk consistency', 'Flakes in foremilk', 'CMT positive', 'Recheck in 3 days'],
  };

  const treatments = [];
  const treatmentMeds = [];

  for (const issue of Object.values(healthIssueIndex)) {
    // 85% of issues get treated
    if (Math.random() > 0.85) continue;

    const meds = treatmentMap[issue.issueCode] || ['Vitamins B-complex'];
    // Pick 1 or sometimes 2 medications
    const numMeds = (meds.length > 1 && Math.random() < 0.3) ? 2 : 1;

    for (let m = 0; m < numMeds; m++) {
      const medName = meds[m];
      const med = medMap[medName];
      if (!med) continue;

      // Treatment date: 0-2 days after issue observed
      const treatDate = new Date(issue.issueDate);
      treatDate.setDate(treatDate.getDate() + Math.floor(rand(0, 3)));
      if (treatDate > today) continue;

      const costRange = costRanges[medName] || [20, 50];
      const cost = Math.round(rand(costRange[0], costRange[1]) * 100) / 100;

      // Vet visits for high severity
      const isVet = issue.severity === 'high' && Math.random() < 0.6;

      // Calculate withdrawal dates
      let withdrawalEndMilk = null;
      let withdrawalEndMeat = null;
      if (med.withdrawal_milk_hours > 0) {
        const wm = new Date(treatDate);
        wm.setHours(wm.getHours() + med.withdrawal_milk_hours);
        withdrawalEndMilk = isoDatetime(wm);

        // Track for milk discard records
        if (!cowWithdrawalEnd[issue.cow_id] || wm > cowWithdrawalEnd[issue.cow_id]) {
          cowWithdrawalEnd[issue.cow_id] = new Date(wm);
        }
      }
      if (med.withdrawal_meat_days > 0) {
        const wt = new Date(treatDate);
        wt.setDate(wt.getDate() + med.withdrawal_meat_days);
        withdrawalEndMeat = isoDatetime(wt);
      }

      // ~60% of treatments get a note
      const notePool = treatmentNotes[issue.issueCode] || ['General supportive care'];
      const note = Math.random() < 0.6 ? pick(notePool) : null;

      const treatmentId = uuidv4();
      treatments.push({
        id: treatmentId,
        farm_id: DEFAULT_FARM_ID,
        cow_id: issue.cow_id,
        health_issue_id: issue.id,
        medication_id: med.id,
        administered_by: pick(reporters),
        dosage: med.default_dosage || '5ml',
        cost,
        treatment_date: isoDatetime(treatDate),
        withdrawal_end_milk: withdrawalEndMilk,
        withdrawal_end_meat: withdrawalEndMeat,
        is_vet_visit: isVet ? 1 : 0,
        vet_name: isVet ? pick(['Dr. H. Botha', 'Dr. P. van Niekerk', 'Dr. S. Dlamini']) : null,
        notes: note,
        created_at: isoDatetime(treatDate),
        updated_at: isoDatetime(treatDate),
      });
      treatmentMeds.push({
        id: uuidv4(),
        treatment_id: treatmentId,
        medication_id: med.id,
        dosage: med.default_dosage || '5ml',
      });
    }
  }

  for (let i = 0; i < treatments.length; i += 100) {
    await knex.batchInsert('treatments', treatments.slice(i, i + 100), 100);
  }
  for (let i = 0; i < treatmentMeds.length; i += 100) {
    await knex.batchInsert('treatment_medications', treatmentMeds.slice(i, i + 100), 100);
  }

  // Now update milk records that fall within withdrawal periods
  // For each treatment with a milk withdrawal, mark milk records during that window
  for (const t of treatments) {
    if (!t.withdrawal_end_milk) continue;
    const treatStart = t.treatment_date.slice(0, 10);
    const treatEnd = t.withdrawal_end_milk.slice(0, 10);

    await knex('milk_records')
      .where('cow_id', t.cow_id)
      .where('recording_date', '>=', treatStart)
      .where('recording_date', '<=', treatEnd)
      .update({
        milk_discarded: 1,
        discard_reason: 'Withdrawal period — antibiotics',
      });
  }

  // ── Generate historical breeding cycles ──────────────────────────────────
  // Creates complete cycles: calving → (voluntary wait ~60d) → heat → AI →
  //   preg_check_positive/negative → (if neg: re-heat → re-AI → preg_check) → calving
  // Goal: realistic calving intervals (365-420d), days-open data, varied conception rates

  // Get ALL female cows that have been alive long enough to have breeding history
  const breedingCows = await knex('cows')
    .whereNull('deleted_at')
    .where('sex', 'female')
    .whereNotIn('status', ['sold', 'dead'])
    .where('dob', '<', isoDate(startDate)) // at least 2 years old
    .select('id', 'tag_number', 'name', 'breed_type_id', 'dob');

  // Look up breed types for gestation lengths
  const breedTypeRows = await knex('breed_types').select('id', 'code', 'gestation_days');
  const gestationMap = {};
  for (const bt of breedTypeRows) {
    gestationMap[bt.id] = bt.gestation_days || 283;
  }

  // Get existing breeding events so we don't create duplicates
  const existingEvents = await knex('breeding_events')
    .select('cow_id', 'event_type', 'event_date');
  const existingCalvings = new Set();
  const cowsWithEvents = new Set();
  for (const e of existingEvents) {
    cowsWithEvents.add(e.cow_id);
    if (e.event_type === 'calving') {
      const evtDateStr = e.event_date instanceof Date ? e.event_date.toISOString() : String(e.event_date)
      existingCalvings.add(`${e.cow_id}:${evtDateStr.slice(0, 7)}`);
    }
  }

  // Bulls for sire assignment
  const bulls = await knex('cows')
    .whereNull('deleted_at')
    .where('sex', 'male')
    .select('id', 'breed_type_id');
  const bullIds = bulls.map(b => b.id);

  const breedingEvents = [];

  // Helper: generate a complete breeding cycle starting from a calving date
  // Returns the calving event + all intermediate events, and the next expected calving date
  function generateCycle(cowId, calvingDate, gestationDays) {
    const events = [];

    // Calving event (only if not already in seed 001)
    const monthKey = `${cowId}:${calvingDate.toISOString().slice(0, 7)}`;
    if (!existingCalvings.has(monthKey)) {
      events.push({
        id: uuidv4(),
        cow_id: cowId,
        event_type: 'calving',
        event_date: isoDate(calvingDate),
        sire_id: pick(bullIds),
        calving_details: JSON.stringify({
          calf_sex: Math.random() < 0.5 ? 'male' : 'female',
          calf_alive: Math.random() < 0.92,
        }),
        recorded_by: pick(reporters),
        created_at: isoDatetime(calvingDate),
        updated_at: isoDatetime(calvingDate),
      });
    }

    // Voluntary waiting period: 45-75 days post-calving
    const vwpDays = Math.floor(rand(45, 75));
    const heatDate = new Date(calvingDate);
    heatDate.setDate(heatDate.getDate() + vwpDays);

    if (heatDate > today) return { events, nextCalving: null };

    // Heat observed
    const heatSigns = pick([
      ['standing_heat'],
      ['standing_heat', 'mucus_discharge'],
      ['standing_heat', 'restlessness'],
      ['mucus_discharge', 'vulva_swelling'],
    ]);
    events.push({
      id: uuidv4(),
      cow_id: cowId,
      event_type: 'heat_observed',
      event_date: isoDate(heatDate),
      heat_signs: JSON.stringify(heatSigns),
      recorded_by: pick(reporters),
      created_at: isoDatetime(heatDate),
      updated_at: isoDatetime(heatDate),
    });

    // AI insemination (same day or next day)
    const aiDate = new Date(heatDate);
    aiDate.setDate(aiDate.getDate() + (Math.random() < 0.7 ? 0 : 1));
    if (aiDate > today) return { events, nextCalving: null };

    const sireId = pick(bullIds);
    events.push({
      id: uuidv4(),
      cow_id: cowId,
      event_type: 'ai_insemination',
      event_date: isoDate(aiDate),
      sire_id: sireId,
      inseminator: pick(['Dr. H. Botha', 'Dr. M. van der Merwe', 'Dr. P. van Niekerk']),
      cost: Math.round(rand(250, 400)),
      recorded_by: pick(reporters),
      created_at: isoDatetime(aiDate),
      updated_at: isoDatetime(aiDate),
    });

    // Conception probability: ~55% first service (realistic for dairy)
    // If failed: repeat cycle (heat → AI) after 21 days
    let serviceCount = 1;
    let conceived = Math.random() < 0.55;
    let lastAiDate = new Date(aiDate);

    while (!conceived && serviceCount < 4) {
      // Preg check negative at ~35 days post-AI
      const negCheckDate = new Date(lastAiDate);
      negCheckDate.setDate(negCheckDate.getDate() + 35);
      if (negCheckDate > today) return { events, nextCalving: null };

      events.push({
        id: uuidv4(),
        cow_id: cowId,
        event_type: 'preg_check_negative',
        event_date: isoDate(negCheckDate),
        preg_check_method: pick(['manual', 'ultrasound', 'blood_test']),
        recorded_by: pick(reporters),
        created_at: isoDatetime(negCheckDate),
        updated_at: isoDatetime(negCheckDate),
      });

      // Re-heat ~21 days after last AI (roughly aligns with neg check timing)
      const reHeatDate = new Date(lastAiDate);
      reHeatDate.setDate(reHeatDate.getDate() + 21);
      if (reHeatDate > today) return { events, nextCalving: null };

      events.push({
        id: uuidv4(),
        cow_id: cowId,
        event_type: 'heat_observed',
        event_date: isoDate(reHeatDate),
        heat_signs: JSON.stringify(pick([['standing_heat'], ['standing_heat', 'mucus_discharge']])),
        recorded_by: pick(reporters),
        created_at: isoDatetime(reHeatDate),
        updated_at: isoDatetime(reHeatDate),
      });

      // Re-AI
      const reAiDate = new Date(reHeatDate);
      reAiDate.setDate(reAiDate.getDate() + (Math.random() < 0.7 ? 0 : 1));
      if (reAiDate > today) return { events, nextCalving: null };

      events.push({
        id: uuidv4(),
        cow_id: cowId,
        event_type: 'ai_insemination',
        event_date: isoDate(reAiDate),
        sire_id: pick(bullIds),
        inseminator: pick(['Dr. H. Botha', 'Dr. M. van der Merwe']),
        cost: Math.round(rand(250, 400)),
        recorded_by: pick(reporters),
        created_at: isoDatetime(reAiDate),
        updated_at: isoDatetime(reAiDate),
      });

      lastAiDate = new Date(reAiDate);
      serviceCount++;
      // Higher conception rate on subsequent attempts
      conceived = Math.random() < (serviceCount === 2 ? 0.60 : 0.70);
    }

    if (!conceived) return { events, nextCalving: null };

    // Preg check positive at ~35 days post-AI
    const posCheckDate = new Date(lastAiDate);
    posCheckDate.setDate(posCheckDate.getDate() + 35);
    if (posCheckDate > today) return { events, nextCalving: null };

    const expectedCalving = new Date(lastAiDate);
    expectedCalving.setDate(expectedCalving.getDate() + gestationDays);

    events.push({
      id: uuidv4(),
      cow_id: cowId,
      event_type: 'preg_check_positive',
      event_date: isoDate(posCheckDate),
      preg_check_method: pick(['manual', 'ultrasound']),
      expected_calving: isoDate(expectedCalving),
      notes: `Confirmed at ${35} days. Service #${serviceCount}.`,
      recorded_by: pick(reporters),
      created_at: isoDatetime(posCheckDate),
      updated_at: isoDatetime(posCheckDate),
    });

    return { events, nextCalving: expectedCalving <= today ? expectedCalving : null };
  }

  // Generate 1-3 complete cycles per mature cow (only those without existing events)
  // For cows WITH existing events in seed 001, we skip — seed 001 already has their current state
  for (const cow of breedingCows) {
    if (cowsWithEvents.has(cow.id)) continue; // seed 001 already covered this cow

    const gestation = gestationMap[cow.breed_type_id] || 283;
    const cowAge = Math.round((today.getTime() - new Date(cow.dob).getTime()) / 86400000);

    // First calving at ~24 months of age
    const firstCalvingAge = Math.floor(rand(700, 780)); // ~23-26 months
    if (cowAge < firstCalvingAge) continue; // too young

    const firstCalvingDate = new Date(cow.dob);
    firstCalvingDate.setDate(firstCalvingDate.getDate() + firstCalvingAge);

    // Only include cycles within our 2-year window
    let currentCalving = firstCalvingDate;
    if (currentCalving < startDate) {
      // Fast-forward to a calving that falls within the window
      while (currentCalving < startDate) {
        currentCalving.setDate(currentCalving.getDate() + Math.floor(rand(365, 420)));
      }
    }

    // Generate up to 3 cycles
    for (let cycle = 0; cycle < 3; cycle++) {
      if (currentCalving > today) break;

      const { events, nextCalving } = generateCycle(cow.id, currentCalving, gestation);
      breedingEvents.push(...events);

      if (!nextCalving) break;
      currentCalving = nextCalving;
    }
  }

  // Also backfill connecting events for cows that HAVE calvings in seed 001
  // but are missing the AI + preg_check events between calvings.
  // We look for pairs of calvings and insert service events between them.
  const calving001 = existingEvents
    .filter(e => e.event_type === 'calving')
    .reduce((acc, e) => {
      if (!acc[e.cow_id]) acc[e.cow_id] = [];
      acc[e.cow_id].push(e.event_date);
      return acc;
    }, {});

  for (const [cowId, dates] of Object.entries(calving001)) {
    const sorted = [...dates].sort();
    if (sorted.length < 2) continue;

    for (let i = 0; i < sorted.length - 1; i++) {
      const calvDate = new Date(sorted[i]);
      const nextCalv = new Date(sorted[i + 1]);

      // Check if there's already an AI event between these calvings
      const hasExistingAI = existingEvents.some(e =>
        e.cow_id === cowId &&
        (e.event_type === 'ai_insemination' || e.event_type === 'bull_service') &&
        e.event_date > sorted[i] && e.event_date < sorted[i + 1]
      );
      if (hasExistingAI) continue;

      // Insert heat → AI → preg_check_positive between the two calvings
      // Voluntary wait ~60 days after calving
      const heatDate = new Date(calvDate);
      heatDate.setDate(heatDate.getDate() + Math.floor(rand(50, 80)));

      const aiDate = new Date(heatDate);
      aiDate.setDate(aiDate.getDate() + 1);

      // Calculate how many services based on the gap
      const daysFromAiToCalving = Math.round((nextCalv.getTime() - aiDate.getTime()) / 86400000);
      const serviceCount = daysFromAiToCalving > 310 ? Math.floor(rand(2, 4)) : 1;

      let lastAi = aiDate;

      // First attempt
      breedingEvents.push({
        id: uuidv4(),
        cow_id: cowId,
        event_type: 'heat_observed',
        event_date: isoDate(heatDate),
        heat_signs: JSON.stringify(['standing_heat']),
        recorded_by: pick(reporters),
        created_at: isoDatetime(heatDate),
        updated_at: isoDatetime(heatDate),
      });
      breedingEvents.push({
        id: uuidv4(),
        cow_id: cowId,
        event_type: 'ai_insemination',
        event_date: isoDate(aiDate),
        sire_id: pick(bullIds),
        inseminator: pick(['Dr. H. Botha', 'Dr. M. van der Merwe']),
        cost: Math.round(rand(250, 400)),
        recorded_by: pick(reporters),
        created_at: isoDatetime(aiDate),
        updated_at: isoDatetime(aiDate),
      });

      // Failed attempts (if multi-service)
      for (let s = 1; s < serviceCount; s++) {
        const negDate = new Date(lastAi);
        negDate.setDate(negDate.getDate() + 35);
        breedingEvents.push({
          id: uuidv4(),
          cow_id: cowId,
          event_type: 'preg_check_negative',
          event_date: isoDate(negDate),
          preg_check_method: pick(['manual', 'ultrasound']),
          recorded_by: pick(reporters),
          created_at: isoDatetime(negDate),
          updated_at: isoDatetime(negDate),
        });

        const reHeat = new Date(lastAi);
        reHeat.setDate(reHeat.getDate() + 21);
        breedingEvents.push({
          id: uuidv4(),
          cow_id: cowId,
          event_type: 'heat_observed',
          event_date: isoDate(reHeat),
          heat_signs: JSON.stringify(['standing_heat']),
          recorded_by: pick(reporters),
          created_at: isoDatetime(reHeat),
          updated_at: isoDatetime(reHeat),
        });

        const reAi = new Date(reHeat);
        reAi.setDate(reAi.getDate() + 1);
        breedingEvents.push({
          id: uuidv4(),
          cow_id: cowId,
          event_type: 'ai_insemination',
          event_date: isoDate(reAi),
          sire_id: pick(bullIds),
          inseminator: pick(['Dr. H. Botha', 'Dr. M. van der Merwe']),
          cost: Math.round(rand(250, 400)),
          recorded_by: pick(reporters),
          created_at: isoDatetime(reAi),
          updated_at: isoDatetime(reAi),
        });
        lastAi = reAi;
      }

      // Final preg check positive
      const posDate = new Date(lastAi);
      posDate.setDate(posDate.getDate() + 35);
      breedingEvents.push({
        id: uuidv4(),
        cow_id: cowId,
        event_type: 'preg_check_positive',
        event_date: isoDate(posDate),
        preg_check_method: pick(['manual', 'ultrasound']),
        expected_calving: isoDate(nextCalv),
        notes: `Confirmed. Service #${serviceCount}.`,
        recorded_by: pick(reporters),
        created_at: isoDatetime(posDate),
        updated_at: isoDatetime(posDate),
      });
    }
  }

  // Insert breeding events (with CHECK constraint bypass for dry_off type)
  const normalisedBreedingEvents = breedingEvents.map((e) => ({
    farm_id: DEFAULT_FARM_ID,
    ...e,
  }));
  if (normalisedBreedingEvents.length > 0) {
    if (isSQLite) await knex.raw('PRAGMA ignore_check_constraints = ON')
    try {
      for (let i = 0; i < normalisedBreedingEvents.length; i += 50) {
        await knex.batchInsert('breeding_events', normalisedBreedingEvents.slice(i, i + 50), 50);
      }
    } finally {
      if (isSQLite) await knex.raw('PRAGMA ignore_check_constraints = OFF')
    }
  }

   
  console.log(`[demo-analytics] Seeded:`);
  console.log(`  ${milkRecords.length.toLocaleString()} milk records`);
  console.log(`  ${healthIssues.length} health issues`);
  console.log(`  ${treatments.length} treatments (${treatmentMeds.length} medication links)`);
  console.log(`  ${breedingEvents.length} breeding events (historical cycles)`);
   
};
