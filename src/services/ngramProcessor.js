// Constants for N-gram processing
const MIN_YEAR = 1800;
const MAX_YEAR = new Date().getFullYear();
const NGRAM_API = process.env.REACT_APP_NGRAM_API || 'https://api.nb.no/dhlab/nb_ngram/ngram/query';
const REQUEST_TIMEOUT_MS = 30000;
const STANDARD_RELATIVE_NORMALIZATION = 'standard';
const FUNCTION_WORD_RELATIVE_NORMALIZATION = 'functionWords';
const FUNCTION_WORD_BASELINE_SHARE_PERCENT = 100 / 11.8;
const FUNCTION_WORD_BASELINE_TERMS = ['og', 'på', 'av', 'det', 'der', 'har', 'er', 'med', 'paa', 'af'];
const CORPUS_MAP = {
    'bok': 'bok',
    'avis': 'avis'
};
const LANG_MAP = {
    'nob': 'nob',
    'nno': 'nno',
    'sme': 'sme',
    'smj': 'smj',
    'sma': 'sma',
    'fkv': 'fkv'
};
const GRAPH_MODE_MAP = {
    'relative': 'relative',
    'absolute': 'absolutt',
    'cumulative': 'absolutt',
    'cohort': 'absolutt'
};

// Process N-gram data
const processNgramData = (data, mode, smooth) => {
    if (!data || !data.length) return null;

    let processedData = [...data];

    // Apply mode-specific processing
    switch (mode) {
        case 'cumulative':
            processedData = processedData.map(series => {
                let sum = 0;
                return series.map(value => {
                    sum += value;
                    return sum;
                });
            });
            break;
            
        case 'cohort':
            // Calculate relative frequencies for each year
            processedData = processedData.map(series => {
                const total = series.reduce((a, b) => a + b, 0);
                return series.map(value => value / total);
            });
            break;
            
        case 'relative':
            // Already in relative format
            break;
            
        case 'absolute':
            // Already in absolute format
            break;
            
        default:
            // Default to relative frequency
            break;
    }

    // Apply smoothing if needed
    if (smooth > 1) {
        processedData = processedData.map(series => {
            return series.map((value, index) => {
                const start = Math.max(0, index - Math.floor(smooth / 2));
                const end = Math.min(series.length, index + Math.floor(smooth / 2) + 1);
                const window = series.slice(start, end);
                return window.reduce((a, b) => a + b, 0) / window.length;
            });
        });
    }

    return processedData;
};

const getApiLang = (corpus, lang) => (corpus === 'avis' ? 'nor' : LANG_MAP[lang] || 'nob');

const fetchRawNgrams = async (terms, corpus, lang, apiMode, settings = {}) => {
    const params = new URLSearchParams({
        terms: terms.join(','),
        lang: getApiLang(corpus, lang),
        case_sens: settings?.capitalization ? '1' : '0',
        corpus: CORPUS_MAP[corpus],
        mode: apiMode,
        smooth: '1',
        from: MIN_YEAR.toString(),
        to: MAX_YEAR.toString()
    });

    const url = `${NGRAM_API}?${params.toString()}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }

        try {
            return await response.json();
        } catch {
            throw new Error('Kunne ikke lese JSON-respons fra N-gram API.');
        }
    } finally {
        clearTimeout(timeoutId);
    }
};

const collectSortedYears = (ngrams) => {
    const allYears = new Set();
    ngrams.forEach((ngram) => {
        if (!ngram?.values) {
            return;
        }

        ngram.values.forEach((point) => {
            const year = parseInt(point.x, 10);
            if (year >= MIN_YEAR && year <= MAX_YEAR) {
                allYears.add(year);
            }
        });
    });

    return Array.from(allYears).sort((a, b) => a - b);
};

const buildYearValueMap = (values, valueKey) => new Map(
    values
        .filter((point) => {
            const year = parseInt(point.x, 10);
            return year >= MIN_YEAR && year <= MAX_YEAR;
        })
        .map((point) => [parseInt(point.x, 10), Number(point?.[valueKey]) || 0])
);

const buildYearTotals = (ngrams, years, valueKey) => years.map((year) => (
    ngrams.reduce((sum, ngram) => {
        const value = ngram?.values?.find((point) => parseInt(point.x, 10) === year);
        return sum + (value ? (Number(value?.[valueKey]) || 0) : 0);
    }, 0)
));

// Fetch N-gram data from the API
const fetchNgramData = async (words, corpus, lang, graphType = 'relative', settings = {}) => {
    try {
        const trimmedWords = (words || []).map((word) => String(word).trim()).filter(Boolean);
        if (trimmedWords.length === 0) {
            throw new Error('Skriv inn minst ett søkeord.');
        }
        const relativeNormalization = settings?.relativeNormalization || STANDARD_RELATIVE_NORMALIZATION;
        const usesFunctionWordRelative = graphType === 'relative'
            && corpus === 'avis'
            && relativeNormalization === FUNCTION_WORD_RELATIVE_NORMALIZATION;
        const ngrams = await fetchRawNgrams(
            trimmedWords,
            corpus,
            lang,
            usesFunctionWordRelative ? 'absolutt' : GRAPH_MODE_MAP[graphType],
            settings
        );
        const baselineNgrams = usesFunctionWordRelative
            ? await fetchRawNgrams(FUNCTION_WORD_BASELINE_TERMS, corpus, lang, 'absolutt', settings)
            : [];
        
        // Process the raw ngram data
        const processedData = {
            dates: [],
            series: []
        };
        const sortedYears = collectSortedYears(ngrams);
        processedData.dates = sortedYears;
        const baselineTotals = usesFunctionWordRelative
            ? buildYearTotals(baselineNgrams, sortedYears, 'f')
            : null;

        // Extract data from the API response
        ngrams.forEach(ngram => {
            if (ngram && ngram.values) {
                const values = ngram.values;
                if (values.length > 0) {
                    // Create a map of year to value for this ngram
                    const usesAbsoluteValues = graphType === 'absolute' || graphType === 'cumulative' || usesFunctionWordRelative;
                    const yearToValue = buildYearValueMap(values, usesAbsoluteValues ? 'f' : 'y');
                    
                    // Create data array with zeros for missing years
                    let data = sortedYears.map(year => yearToValue.get(year) || 0);

                    // Apply mode-specific processing
                    if (usesFunctionWordRelative) {
                        data = data.map((value, index) => {
                            const baselineTotal = baselineTotals?.[index] || 0;
                            return baselineTotal > 0
                                ? (value / baselineTotal) * FUNCTION_WORD_BASELINE_SHARE_PERCENT
                                : 0;
                        });
                    } else if (graphType === 'cumulative') {
                        let sum = 0;
                        data = data.map(val => {
                            sum += val;
                            return sum;
                        });
                    } else if (graphType === 'cohort') {
                        // Calculate row sums for normalization
                        const rowSums = buildYearTotals(ngrams, sortedYears, 'y');
                        // Normalize by row sum
                        data = data.map((val, i) => rowSums[i] > 0 ? val / rowSums[i] : 0);
                    }

                    processedData.series.push({
                        name: ngram.key,
                        data
                    });
                }
            }
        });

        return processedData;
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error('Foresporselen tok for lang tid. Prov igjen.');
        }
        throw new Error(error?.message || 'Klarte ikke hente N-gram-data.');
    }
};

export {
    MIN_YEAR,
    MAX_YEAR,
    processNgramData,
    fetchNgramData
}; 