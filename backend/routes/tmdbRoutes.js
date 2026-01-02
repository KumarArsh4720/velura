import express from "express";
import fetch from "node-fetch";
import {
  getTrendingMovies,
  getTrendingSeries,
  getTrailer,
  getTrendingWithTrailers,
  getMovieDetails,
  getRecommendedMovies
} from "../controllers/tmdbController.js";

// Import safeFetch function
import { safeFetch } from "../controllers/tmdbController.js";

const router = express.Router();

// Your Worker URL
const WORKER_URL = "https://tmdb-worker.kumararsh4720.workers.dev";

// --- Existing routes ---
router.get("/trending/movies", getTrendingMovies);
router.get("/trending/series", getTrendingSeries);
router.get("/trailer/:type/:id", getTrailer);
router.get("/movie/:type/:id", getMovieDetails);  // NEW ROUTE
router.get("/trending-with-trailers", getTrendingWithTrailers);
router.get("/recommended", getRecommendedMovies);

// --- Updated Health route to check Worker ---
router.get("/health", async (req, res) => {
  try {
    const response = await fetch(`${WORKER_URL}/movie/550`);

    if (response.ok) {
      const data = await response.json();
      res.json({
        backend: "✅ Backend running",
        tmdb: "✅ TMDB via Worker - WORKING",
        movie: data.title ? `✅ ${data.title}` : "✅ Connected",
        endpoints: [
          "/trending/movies",
          "/trending/series",
          "/movie/movie/:id",
          "/movie/tv/:id"
        ]
      });
    } else {
      const errorData = await response.json();
      res.json({
        backend: "✅ Backend running",
        tmdb: `❌ Worker failed: ${errorData.status_message || response.status}`,
      });
    }
  } catch (err) {
    res.json({
      backend: "✅ Backend running",
      tmdb: "❌ Cannot reach Worker",
      error: err.message
    });
  }
});

// ✅ FIXED: Season route using your Worker
router.get('/tv/:id/season/:season', async (req, res) => {
  try {
    const { id, season } = req.params;
    console.log(`📺 Fetching season data for tv/${id}/season/${season}...`);

    // Use your existing Cloudflare worker
    const seasonData = await safeFetch(`tv/${id}/season/${season}`);

    console.log(`✅ Season ${season} fetched: ${seasonData.episodes?.length || 0} episodes`);

    res.json(seasonData);
  } catch (error) {
    console.error('❌ Error fetching season data:', error.message);

    // Provide helpful error response
    res.status(500).json({
      error: 'Failed to fetch season data',
      message: error.message,
      suggestion: 'Check if the worker endpoint is working: ' +
        `https://tmdb-worker.kumararsh4720.workers.dev/tv/${req.params.id}/season/${req.params.season}`
    });
  }
});

router.get("/search/:query", async (req, res) => {
  try {
    const { query } = req.params;
    const { page = 1 } = req.query;

    console.log(`🔍 Searching TMDB for: "${query}"`);

    // Search both movies and TV shows with multiple pages for more results
    const [moviesPage1, moviesPage2, tvPage1, tvPage2] = await Promise.all([
      safeFetch(`search/movie?query=${encodeURIComponent(query)}&page=1`),
      safeFetch(`search/movie?query=${encodeURIComponent(query)}&page=2`),
      safeFetch(`search/tv?query=${encodeURIComponent(query)}&page=1`),
      safeFetch(`search/tv?query=${encodeURIComponent(query)}&page=2`)
    ]);

    // Combine all results
    const combinedResults = [
      ...(moviesPage1.results || []).map(item => ({ ...item, media_type: 'movie' })),
      ...(moviesPage2.results || []).map(item => ({ ...item, media_type: 'movie' })),
      ...(tvPage1.results || []).map(item => ({ ...item, media_type: 'tv' })),
      ...(tvPage2.results || []).map(item => ({ ...item, media_type: 'tv' }))
    ];

    // Remove duplicates (by id and type)
    const uniqueResults = [];
    const seen = new Set();

    combinedResults.forEach(item => {
      const key = `${item.id}_${item.media_type}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueResults.push(item);
      }
    });

    // Sort by popularity (most popular first)
    uniqueResults.sort((a, b) => b.popularity - a.popularity);

    // Limit to 50 results maximum
    const finalResults = uniqueResults.slice(0, 50);

    console.log(`✅ Found ${finalResults.length} unique results for "${query}"`);

    res.json({
      query: query,
      page: parseInt(page),
      total_results: finalResults.length,
      results: finalResults
    });
  } catch (err) {
    console.error('❌ Error in search:', err.message);
    res.status(500).json({
      error: 'Failed to search',
      details: err.message
    });
  }
});

export default router;