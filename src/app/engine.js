/* Offline program exploration. The editorial lenses draw on SC26's published
   program areas: https://sc26.supercomputing.org/program/papers/ */
(function (root) {
  'use strict';

  // Each expression describes a technical concept. Word boundaries keep short
  // terms such as AI and MPI from matching names or unrelated words.
  const definitions = [
    ['superconductivity', 'Superconductivity & cryogenics', '#9DC8F3', /\b(?:superconduct(?:ing|ive|ivity|or|ors)?|cryogenic(?:s|ally)?|cryostats?|cryocoolers?|cryogen(?:s|ic)?|dilution refrigerators?|josephson|single flux quantum|rsfq|ersfq|sfq|meissner effect|cooper pairs?|flux qubits?)\b/g],
    ['ai', 'AI & machine learning', '#91A8FF', /\b(?:ai|ml|genai|artificial intelligence|machine learning|deep learning|llms?|large language models?|language models?|generative models?|inference|neural networks?|neural operators?|foundation models?|deep neural|transformers?|agentic|pytorch|tensorflow|retrieval augmented generation|model training|distributed training)\b/g],
    ['algorithms', 'Algorithms & mathematics', '#65D6AD', /\b(?:algorithms?|algorithmic|numerical methods?|linear algebra|sparse matrices|sparse matrix|matrix multiplication|spgemm|gemm|eigensolvers?|eigenvalues?|iterative solvers?|multigrid|krylov|fourier|fft|finite elements?|differential equations?|graph processing|graph analytics|graph partitioning|monte carlo|uncertainty quantification|preconditioners?|tensors? contractions?)\b/g],
    ['hardware', 'Accelerators & architecture', '#EAB465', /\b(?:gpus?|gpgpus?|cpus?|tpus?|fpgas?|asics?|chiplets?|processors?|accelerators?|hardware architectures?|computer architecture|architectures? and networks|microarchitectures?|heterogeneous (?:systems|architectures|computing)|hbm|high bandwidth memory|risc v|tensor cores?|hardware software co design|cache coherence)\b/g],
    ['networks', 'Networks & interconnects', '#5CC7E3', /\b(?:networks? and interconnects?|interconnects?|networking|infiniband|ethernet|rdma|rocev?2?|scinet|network protocols?|network traffic|optical networks?|congestion control|collective communications?|allreduce|all reduce|packet switching|wide area networks?|message passing)\b/g],
    ['data', 'Storage & data management', '#70C6B3', /\b(?:storage|data management|data movement|data reduction|data compression|compression|data analytics|databases?|file ?systems?|filesystems?|parallel i\/?o|i\/o|input output|lustre|hdf5|adios2?|checkpointing|metadata|data provenance|data pipelines?|data logistics|scientific data|data intensive)\b/g],
    ['visual', 'Visualization & graphics', '#EC96C6', /\b(?:visualization|visualisation|visual analytics|visual computing|computer graphics|rendering|ray tracing|volume rendering|in situ visualization|paraview|vtk|immersive|virtual reality|art of hpc|sci ?vis)\b/g],
    ['science', 'Applications & science', '#82B7E8', /\b(?:climate|weather|earth science|atmospheric|ocean modeling|astrophysics|astronomy|cosmology|galax(?:y|ies)|molecular dynamics|genomics|bioinformatics|biology|biomedical|materials science|computational (?:physics|chemistry|science|medicine|mechanics|fluid dynamics|biology|engineering)|fluid dynamics|cfd|physics informed|particle physics|plasma physics|seismic|astrophysical|metagenomics|protein folding|digital twins?)\b/g],
    ['quantum', 'Quantum & emerging hardware', '#C7A5F6', /\b(?:quantum|qubits?|cryogenics?|cryogenic|superconduct[a-z]*|josephson|post moore|neuromorphic|spintronic[a-z]*|photonic[a-z]*|analog computing|ising machines?|beyond cmos)\b/g],
    ['software', 'Programming & portability', '#AAA8F4', /\b(?:programming|compilers?|compilation|languages? and runtimes?|runtime systems?|domain specific languages?|openmp|openacc|mpi|sycl|kokkos|cuda|hip|fortran|c\+\+|python|julia|portability|portable performance|software engineering|debugging|programming models?|code generation|parallel software)\b/g],
    ['performance', 'Performance & reliability', '#E7BD76', /\b(?:performance (?:analysis|modeling|modelling|evaluation|measurement|engineering|optimization|portability|tools?|prediction|tuning|counter[s]?)|benchmark[a-z]*|profiling|fault toleran[a-z]*|resilien[a-z]*|reliability|load balancing|instrumentation|precision tuning|reproducib[a-z]*|bottlenecks?|weak scaling|strong scaling)\b/g],
    ['systems', 'Systems & cloud', '#86CBCF', /\b(?:system software|operating systems?|systems administration|cloud|containers?|containerization|kubernetes|slurm|orchestration|scheduling|resource management|resource allocation|distributed systems?|workflows?|edge computing|cybersecurity|security|virtualization|cluster management|datacenters?|data centers?)\b/g],
    ['energy', 'Energy & cooling', '#A6CE7B', /\b(?:energy efficien[a-z]*|energy consumption|energy use|energy aware|power management|power and energy|power consumption|power efficiency|power capping|sustainab[a-z]*|carbon (?:aware|footprint|emissions?)|cooling|cryogenics?|cryogenic|thermal management|electricit[a-z]*|waste heat|liquid immersion)\b/g],
    ['practice', 'People & practice', '#DFA294', /\b(?:education|workforce|careers?|early career|mentoring|mentorship|training users|training programs?|community engagement|diversity|inclusion|accessibility|hpc centers?|procurement|leadership development|student cluster competition|state of the practice|research software engineers?|outreach|teaching|pedagogy)\b/g]
  ];
  // Match the conference's actual tag vocabulary, including broad labels
  // such as "Architectures" that a title-oriented keyword rule would miss.
  const officialLenses = new Map([
    ['ai/ml','ai'], ['algorithms','algorithms'], ['architectures','hardware'],
    ['networks','networks'], ['data analytics','data'], ['storage','data'],
    ['art of hpc','visual'], ['visualization','visual'], ['applications','science'],
    ['biomedical','science'], ['quantum computing','quantum'],
    ['programming frameworks','software'], ['profiling and optimization tools','performance'],
    ['system software','systems'], ['cloud computing','systems'], ['power and energy','energy'],
    ['sustainability','energy'], ['state of the practice','practice'], ['community','practice'],
    ['education and workforce development','practice']
  ]);
  const topics = definitions.map(([id, label, color]) => ({id, label, color}));
  const knownTopics = new Set(topics.map(topic => topic.id));
  const classification = new WeakMap();
  const fieldsByItem = new WeakMap();

  function normalize(value) {
    return String(value == null ? '' : value).normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[‐‑‒–—−_-]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function textOf(values) {
    if (!Array.isArray(values)) return values || '';
    return values.map(value => typeof value === 'string' ? value : value.name || value.label || '').join(' ');
  }

  function fieldsOf(item) {
    if (!fieldsByItem.has(item)) {
      fieldsByItem.set(item, {
        title: normalize(item.title),
        tags: (item.topics || []).map(tag => normalize(typeof tag === 'string' ? tag : tag.name || tag.label)).join(' | '),
        description: normalize(item.description)
      });
    }
    return fieldsByItem.get(item);
  }

  function topicEvidence(item) {
    if (classification.has(item)) return classification.get(item);
    const {title,tags,description} = fieldsOf(item);
    const explicitTags = new Set((item.topics || []).map(tag => officialLenses.get(normalize(tag))));
    const evidence = [];
    for (const [id, , , pattern] of definitions) {
      const count = value => new Set(value.match(pattern) || []).size;
      // SC26's "Squid" k-mer counter is a bioinformatics program. Only the
      // instrument acronym "SQUID" provides evidence for superconductivity.
      const instrument = field => id === 'superconductivity' && /\bSQUID(?:s|S)?\b/.test(field || '') ? 1 : 0;
      const headline = count(title) + instrument(item.title);
      const official = Math.max(count(tags) + instrument(textOf(item.topics)), explicitTags.has(id) ? 1 : 0);
      const body = count(description) + instrument(item.description);
      if (headline || official || body) {
        evidence.push({id, weight: 5 * Math.min(headline, 3) + (item.topicsInherited ? 2 : 4) * Math.min(official, 3) + Math.min(body, 4)});
      }
    }
    evidence.sort((a, b) => b.weight - a.weight);
    classification.set(item, evidence);
    return evidence;
  }

  function classify(item) {
    return topicEvidence(item).map(topic => topic.id);
  }

  // Expand only recognized domain-specific variants. All other words and
  // punctuation are literal, so "MPI" cannot match "compiler" and a phrase
  // cannot be assembled from unrelated words scattered through an abstract.
  const variations = new Map();
  for (const term of ['squid','gpu','cpu','tpu','qpu','fpga','asic','llm','tokamak','qubit','cryostat','cryocooler','network','junction']) {
    for (const variant of [term, term + 's']) variations.set(variant, term + 's?');
  }
  for (const term of ['superconduct','superconductor','superconductors','superconducting','superconductivity','superconductive']) {
    variations.set(term,'superconduct(?:or|ors|ing|ivity|ive)?');
  }
  for (const term of ['cryogenic','cryogenics']) variations.set(term,'cryogenics?');

  function compileKeywords(keywords) {
    const terms = new Map();
    for (const value of keywords || []) {
      if (typeof value !== 'string') continue;
      const text = normalize(value);
      const instrument = /^SQUID(?:s|S)?$/.test(value.trim());
      if (!text || terms.has(text)) continue;
      const phrase = text.split(' ').map(word => variations.get(word) ||
        word.replace(/[.*+?^{}()|[\]\\$]/g,'\\$&')).join(' ');
      const pattern = new RegExp('(?:^|[^\\p{L}\\p{N}])' + phrase + '(?=$|[^\\p{L}\\p{N}])','u');
      terms.set(text,{id:value.trim(),pattern:instrument ? /\bSQUID(?:s|S)?\b/ : pattern,instrument});
    }
    return [...terms.values()];
  }

  function keywordEvidence(item,keywords) {
    const fields = fieldsOf(item);
    const found = [];
    for (const {id,pattern,instrument} of keywords) {
      const source = instrument ? {title:item.title || '',tags:textOf(item.topics),description:item.description || ''} : fields;
      const weight = pattern.test(source.title) ? 14 : pattern.test(source.tags) ? 8 :
        pattern.test(source.description) ? 3 : 0;
      if (weight) found.push({id,weight});
    }
    return found;
  }

  function searchText(item, peopleById) {
    const fields = [item.title, item.description, item.room, item.format, textOf(item.topics)];
    for (const id of item.people || []) {
      const person = typeof id === 'object' ? id
        : peopleById instanceof Map ? peopleById.get(id) : peopleById && peopleById[id];
      if (person) fields.push(person.name, textOf(person.institutions), textOf(person.countries));
    }
    return normalize(fields.filter(Boolean).join(' '));
  }

  function contentItems(items) {
    const parents = new Set(items.map(item => item.parentId).filter(Boolean));
    return items.filter(item => !parents.has(item.id));
  }

  function clock(value = new Date()) {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone:'America/Chicago', year:'numeric', month:'2-digit', day:'2-digit',
      hour:'2-digit', minute:'2-digit', hourCycle:'h23'
    });
    const fields = Object.fromEntries(fmt.formatToParts(value).map(part => [part.type, part.value]));
    return {day: fields.year + '-' + fields.month + '-' + fields.day,
      minute: (Number(fields.hour) % 24) * 60 + Number(fields.minute)};
  }

  function minutes(time) {
    if (typeof time !== 'string' || !/^\d{1,2}:\d{2}$/.test(time)) return NaN;
    const [hour, minute] = time.split(':').map(Number);
    return hour < 24 && minute < 60 ? hour * 60 + minute : NaN;
  }

  function isDropIn(item) {
    const format = normalize(item.format);
    const title = normalize(item.title);
    const minutesLong = minutes(item.end) - minutes(item.start);
    if (item.dropIn || (format === 'art of hpc' && /exhibition|display|reception/.test(title))) return true;
    return !!(/poster/.test(format) && (
      item.timing === 'flexible' || /poster[s]? display|poster exhibition/.test(title)
      || (minutesLong >= 180 && !/finalist|blitz presentation/.test(title))
      || (item.kind === 'item' && item.timing === 'block')
    ));
  }

  function position(item) {
    return {item, day: item.date || item.day || '', start: minutes(item.start), end: minutes(item.end),
      room:normalize(item.room)};
  }

  function dated(slot) {
    return !!slot.day && Number.isFinite(slot.start) && Number.isFinite(slot.end) && slot.end > slot.start;
  }

  function byTime(a, b) {
    return a.day.localeCompare(b.day) || a.start - b.start || a.end - b.end ||
      String(a.item.id).localeCompare(String(b.item.id));
  }

  function conflict(first, second, walk) {
    if (first.day !== second.day) return '';
    const [early, late] = first.start <= second.start ? [first, second] : [second, first];
    if (early.end > late.start) return 'overlap';
    const sameRoom = early.room && early.room === late.room;
    return !sameRoom && (late.start - early.end < walk) ? 'walk' : '';
  }

  function plan(items, options = {}) {
    const interests = new Set((options.interests || []).filter(id => knownTopics.has(id)));
    const pinned = new Set(options.lockedIds || []);
    const walk = Number.isFinite(options.walkMinutes) ? Math.max(0, options.walkMinutes) : 5;
    const matches = Object.create(null);
    const keywords = compileKeywords(options.keywords);
    const keywordMatches = Object.create(null);
    const from = options.after ?? 0;
    const to = options.until ?? 1440;
    const parentIds = new Set(items.map(item => item.parentId).filter(Boolean));
    const windows = [];
    const locks = [];
    const unscheduled = [];
    const suggestions = [];
    const conflicts = [];

    for (const item of items) {
      const slot = position(item);
      if (options.day && slot.day && slot.day !== options.day) continue;
      const saved = pinned.has(item.id);
      if (!saved && ['job posting','exhibits','career fair'].includes(normalize(item.format))) continue;
      const evidence = interests.size ? topicEvidence(item).filter(topic => interests.has(topic.id)) : [];
      const foundWords = keywords.length ? keywordEvidence(item,keywords) : [];
      if (!saved && !evidence.length && !foundWords.length) continue;
      matches[item.id] = evidence.map(topic => topic.id);
      keywordMatches[item.id] = foundWords.map(word => word.id);
      // Extra matches improve relevance without making a generic abstract
      // that mentions every topic dominate a specific talk.
      const weights = [...evidence.map(topic => Math.min(topic.weight,12)), ...foundWords.map(word => word.weight)].sort((a,b) => b-a);
      slot.relevance = weights.reduce((sum,weight,i) => sum + weight / (i + 1), 0);
      if (!dated(slot)) {
        if (pinned.has(item.id)) unscheduled.push(item);
      } else if (isDropIn(item)) {
        if (saved || (!parentIds.has(item.id) && slot.end > from && slot.start < to)) windows.push(slot);
      } else if (pinned.has(item.id)) {
        locks.push(slot);
      } else if (slot.start >= from && slot.end <= to) {
        const title = normalize(item.title);
        const housekeeping = /(?:^| )(?:break|lunch|opening remarks|welcome remarks|closing remarks|welcome(?: and introductions?)?|session introduction|wrap up(?: and conclusion)?|closing and adjournment)$|^welcome to .+ 20[0-9]{2}$|\b(?:opening|closing) remarks (?:by|from)\b/.test(title);
        if (!housekeeping) {
          suggestions.push(slot);
        }
      }
    }

    locks.sort(byTime);
    for (let i = 0; i < locks.length; ++i) {
      for (let j = i + 1; j < locks.length && locks[j].day === locks[i].day; ++j) {
        if (locks[j].start >= locks[i].end + walk) break;
        const reason = conflict(locks[i], locks[j], walk);
        if (reason) conflicts.push({a: locks[i].item.id, b: locks[j].item.id, reason});
      }
    }

    // Each schedule is a path through ordered intervals. A room-dependent
    // transfer buffer makes a single binary-search predecessor insufficient.
    const days = new Map();
    for (const slot of suggestions) {
      if (locks.some(locked => conflict(locked, slot, walk))) continue;
      if (!days.has(slot.day)) days.set(slot.day, []);
      days.get(slot.day).push(slot);
    }
    const chosen = locks.slice();
    for (const slots of days.values()) {
      slots.sort(byTime);
      let best = -1;
      for (let i = 0; i < slots.length; ++i) {
        const slot = slots[i];
        // Long workshops earn additional credit, with diminishing returns.
        // Titles/tags carry more weight than passing mentions in an abstract.
        const value = slot.relevance * Math.sqrt(Math.min(slot.end - slot.start, 180) / 30);
        slot.score = value;
        slot.previous = -1;
        for (let j = 0; j < i; ++j) {
          const earlier = slots[j];
          if (earlier.end > slot.start || conflict(earlier, slot, walk)) continue;
          if (earlier.score + value > slot.score) {
            slot.score = earlier.score + value;
            slot.previous = j;
          }
        }
        if (best < 0 || slot.score > slots[best].score) best = i;
      }
      for (let i = best; i >= 0; i = slots[i].previous) chosen.push(slots[i]);
    }
    chosen.sort(byTime);
    windows.sort((a,b) => Number(pinned.has(b.item.id)) - Number(pinned.has(a.item.id))
      || b.relevance - a.relevance || byTime(a,b));
    return {items: chosen.map(slot => slot.item), dropIns: windows.map(slot => slot.item),
      conflicts, unscheduled, matches, keywordMatches};
  }

  root.Engine = {topics, classify, searchText, normalize, contentItems, clock, minutes, isDropIn, plan};
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Engine;
})(typeof window === 'undefined' ? globalThis : window);
