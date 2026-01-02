// backend/controllers/tmdbController.js - SILENT VERSION
import fetch from "node-fetch";
import { enhancedLogger as logger } from '../utils/logger.js'; // Import your logger

// Use your Cloudflare worker instead of direct TMDB API
const WORKER_URL = "https://tmdb-worker.kumararsh4720.workers.dev";

// Safe fetch with retries - SILENT VERSION
export async function safeFetch(urlSuffix, retries = 3, delay = 1000) {
  // Remove leading slash if present
  const cleanSuffix = urlSuffix.startsWith('/') ? urlSuffix.substring(1) : urlSuffix;
  const url = `${WORKER_URL}/${cleanSuffix}`;
  
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      
      if (res.ok) {
        const data = await res.json();
        return data;
      } else {
        const errorText = await res.text();
        if (i === retries - 1) {
          throw new Error(`Worker returned ${res.status}: ${errorText}`);
        }
      }
    } catch (err) {
      if (i === retries - 1) {
        throw err;
      }
    }
    
    if (i < retries - 1) {
      await new Promise(r => setTimeout(r, delay));
    }
  }
  
  throw new Error(`Failed after ${retries} retries: ${cleanSuffix}`);
}

// Controllers - SILENT VERSION
export const getTrendingMovies = async (req, res) => {
  try {
    const data = await safeFetch('trending/movie/day');
    
    let movies = [];
    if (data.results && Array.isArray(data.results)) {
      movies = data.results.slice(0, 20);
    } else if (Array.isArray(data)) {
      movies = data.slice(0, 20);
    }
    
    // ✅ ADD THIS: Set media_type for movies
    const moviesWithType = movies.map(movie => ({
      ...movie,
      media_type: 'movie' // Explicitly set
    }));
    
    res.json(moviesWithType); // ✅ Return with media_type
  } catch (err) {
    logger.error(`Error in getTrendingMovies: ${err.message}`);
    res.status(500).json({ 
      error: 'Failed to fetch trending movies',
      details: err.message
    });
  }
};

// Update getTrendingSeries - add media_type
export const getTrendingSeries = async (req, res) => {
  try {
    const data = await safeFetch('trending/tv/day');
    
    let series = [];
    if (data.results && Array.isArray(data.results)) {
      series = data.results.slice(0, 20);
    } else if (Array.isArray(data)) {
      series = data.slice(0, 20);
    }
    
    // ✅ ADD THIS: Set media_type for TV shows
    const seriesWithType = series.map(seriesItem => ({
      ...seriesItem,
      media_type: 'tv' // Explicitly set
    }));
    
    res.json(seriesWithType); // ✅ Return with media_type
  } catch (err) {
    logger.error(`Error in getTrendingSeries: ${err.message}`);
    res.status(500).json({ 
      error: 'Failed to fetch trending series',
      details: err.message
    });
  }
};

// Update getTrailer function - SILENT VERSION
export const getTrailer = async (req, res) => {
  const { type, id } = req.params;
  
  try {
    // Handle TV shows differently to get latest season trailer
    if (type === 'tv') {
      return await getLatestSeasonTrailer(id, res);
    }
    
    // For movies, use the existing logic but filter out shorts
    const details = await safeFetch(`${type}/${id}?append_to_response=videos`);
    
    const videos = details.videos?.results || [];
    
    // Filter only YouTube trailers and teasers, EXCLUDE SHORTS
    const youtubeTrailers = videos.filter(v => {
      // Must be YouTube video
      if (v.site !== "YouTube") return false;
      
      // Must be Trailer or Teaser type
      if (v.type !== "Trailer" && v.type !== "Teaser") return false;
      
      // Check if it's a short/clip/featurette by name
      const name = v.name?.toLowerCase() || '';
      const isShort = name.includes('short') || 
                     name.includes('clip') || 
                     name.includes('featurette') ||
                     name.includes('behind the scenes') ||
                     name.includes('making of') ||
                     name.includes('promo');
      
      // Check if it's a proper trailer by duration (if available)
      // Trailers are usually 1-3 minutes (60-180 seconds)
      if (v.duration) {
        const duration = parseInt(v.duration);
        if (duration < 45 || duration > 300) return false; // Too short or too long
      }
      
      // Check resolution if available
      if (v.size) {
        const size = parseInt(v.size);
        if (size < 720) return false; // Lower than 720p
      }
      
      return !isShort;
    });
    
    let trailer = null;
    
    if (youtubeTrailers.length > 0) {
      // Sort trailers by priority:
      // 1. Official trailers first
      // 2. Latest published date
      // 3. Trailers before teasers
      // 4. Highest quality/resolution
      youtubeTrailers.sort((a, b) => {
        let scoreA = 0;
        let scoreB = 0;
        
        // 1. Official trailers get highest priority
        if (a.official) scoreA += 100;
        if (b.official) scoreB += 100;
        
        // 2. Latest published date
        if (a.published_at && b.published_at) {
          const dateA = new Date(a.published_at);
          const dateB = new Date(b.published_at);
          scoreA += dateA.getTime() / 1000000000; // Convert to score
          scoreB += dateB.getTime() / 1000000000;
        } else if (a.published_at) {
          scoreA += 50;
        } else if (b.published_at) {
          scoreB += 50;
        }
        
        // 3. Trailers before teasers
        if (a.type === "Trailer") scoreA += 25;
        if (b.type === "Trailer") scoreB += 25;
        if (a.type === "Teaser") scoreA -= 10;
        if (b.type === "Teaser") scoreB -= 10;
        
        // 4. Quality/resolution
        if (a.size && b.size) {
          scoreA += parseInt(a.size);
          scoreB += parseInt(b.size);
        }
        
        // 5. Name indicates it's a main trailer
        const nameA = a.name?.toLowerCase() || '';
        const nameB = b.name?.toLowerCase() || '';
        
        if (nameA.includes('official trailer')) scoreA += 20;
        if (nameB.includes('official trailer')) scoreB += 20;
        if (nameA.includes('main trailer')) scoreA += 15;
        if (nameB.includes('main trailer')) scoreB += 15;
        if (nameA.includes('final trailer')) scoreA += 15;
        if (nameB.includes('final trailer')) scoreB += 15;
        if (nameA.includes('trailer #1')) scoreA += 10;
        if (nameB.includes('trailer #1')) scoreB += 10;
        
        return scoreB - scoreA; // Higher score first
      });
      
      // Select the best trailer
      trailer = youtubeTrailers[0];
    } else {
      // Fallback: include everything if no proper trailers found
      const allVideos = videos.filter(v => 
        v.site === "YouTube" && (v.type === "Trailer" || v.type === "Teaser")
      );
      
      if (allVideos.length > 0) {
        // Sort by date (newest first)
        allVideos.sort((a, b) => {
          if (a.published_at && b.published_at) {
            return new Date(b.published_at) - new Date(a.published_at);
          }
          return 0;
        });
        
        trailer = allVideos[0];
      }
    }
    
    res.json({
      title: details.title || details.name,
      overview: details.overview,
      genres: details.genres?.map(g => g.name) || [],
      trailer: trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : "",
      trailer_key: trailer ? trailer.key : "",
      trailer_name: trailer ? trailer.name : "",
      trailer_type: trailer ? trailer.type : "",
      trailer_official: trailer ? trailer.official : false,
      trailer_published_at: trailer ? trailer.published_at : "",
      trailer_size: trailer ? trailer.size : "",
      total_trailers_found: youtubeTrailers.length
    });
  } catch (err) {
    logger.error(`Error in getTrailer: ${err.message}`);
    res.status(500).json({ 
      error: 'Failed to fetch trailer',
      details: err.message
    });
  }
};

// Helper function to get latest season trailer for TV shows - SILENT VERSION
async function getLatestSeasonTrailer(tvId, res) {
  try {
    // First get the show details to know number of seasons
    const showDetails = await safeFetch(`tv/${tvId}`);
    const totalSeasons = showDetails.number_of_seasons || 1;
    
    let latestTrailer = null;
    let latestSeason = null;
    let trailerFound = false;
    
    // Check from latest season to oldest
    for (let season = totalSeasons; season >= 1 && !trailerFound; season--) {
      try {
        const seasonData = await safeFetch(`tv/${tvId}/season/${season}?append_to_response=videos`);
        
        if (seasonData.videos?.results?.length > 0) {
          // Filter out shorts and low-quality videos
          const seasonTrailers = seasonData.videos.results.filter(v => {
            if (v.site !== "YouTube") return false;
            if (v.type !== "Trailer" && v.type !== "Teaser") return false;
            
            // Check for shorts/clips
            const name = v.name?.toLowerCase() || '';
            const isShort = name.includes('short') || 
                           name.includes('clip') || 
                           name.includes('featurette') ||
                           name.includes('behind the scenes') ||
                           name.includes('making of');
            
            // Check resolution
            if (v.size && parseInt(v.size) < 720) return false;
            
            return !isShort;
          });
          
          if (seasonTrailers.length > 0) {
            // Sort to get the best trailer in this season
            seasonTrailers.sort((a, b) => {
              let scoreA = 0;
              let scoreB = 0;
              
              // Official trailers first
              if (a.official) scoreA += 100;
              if (b.official) scoreB += 100;
              
              // Latest date
              if (a.published_at && b.published_at) {
                const dateA = new Date(a.published_at);
                const dateB = new Date(b.published_at);
                scoreA += dateA.getTime() / 1000000000;
                scoreB += dateB.getTime() / 1000000000;
              }
              
              // Trailers before teasers
              if (a.type === "Trailer") scoreA += 25;
              if (b.type === "Trailer") scoreB += 25;
              
              // Higher resolution
              if (a.size && b.size) {
                scoreA += parseInt(a.size);
                scoreB += parseInt(b.size);
              }
              
              // Name indicates main trailer
              const nameA = a.name?.toLowerCase() || '';
              const nameB = b.name?.toLowerCase() || '';
              
              if (nameA.includes('season ' + season)) scoreA += 30;
              if (nameB.includes('season ' + season)) scoreB += 30;
              if (nameA.includes('official')) scoreA += 20;
              if (nameB.includes('official')) scoreB += 20;
              
              return scoreB - scoreA;
            });
            
            latestTrailer = seasonTrailers[0];
            latestSeason = season;
            trailerFound = true;
          }
        }
      } catch (error) {
        continue;
      }
    }
    
    // If no season trailer found, fall back to show trailers
    if (!latestTrailer) {
      const showData = await safeFetch(`tv/${tvId}?append_to_response=videos`);
      const showVideos = showData.videos?.results || [];
      
      // Filter show trailers
      const showTrailers = showVideos.filter(v => {
        if (v.site !== "YouTube") return false;
        if (v.type !== "Trailer" && v.type !== "Teaser") return false;
        
        const name = v.name?.toLowerCase() || '';
        const isShort = name.includes('short') || 
                       name.includes('clip') || 
                       name.includes('featurette');
        
        return !isShort;
      });
      
      if (showTrailers.length > 0) {
        // Sort show trailers by priority
        showTrailers.sort((a, b) => {
          let scoreA = 0;
          let scoreB = 0;
          
          if (a.official) scoreA += 100;
          if (b.official) scoreB += 100;
          
          if (a.published_at && b.published_at) {
            const dateA = new Date(a.published_at);
            const dateB = new Date(b.published_at);
            scoreA += dateA.getTime() / 1000000000;
            scoreB += dateB.getTime() / 1000000000;
          }
          
          return scoreB - scoreA;
        });
        
        latestTrailer = showTrailers[0];
      }
    }
    
    if (latestTrailer) {
      res.json({
        title: showDetails.name,
        overview: showDetails.overview,
        genres: showDetails.genres?.map(g => g.name) || [],
        trailer: `https://www.youtube.com/watch?v=${latestTrailer.key}`,
        trailer_key: latestTrailer.key,
        trailer_name: latestTrailer.name,
        trailer_type: latestTrailer.type,
        trailer_official: latestTrailer.official,
        trailer_published_at: latestTrailer.published_at,
        trailer_season: latestSeason,
        total_seasons: totalSeasons,
        is_latest_season: latestSeason === totalSeasons
      });
    } else {
      res.json({
        title: showDetails.name,
        overview: showDetails.overview,
        genres: showDetails.genres?.map(g => g.name) || [],
        trailer: "",
        message: "No trailer found"
      });
    }
    
  } catch (err) {
    logger.error(`Error in getLatestSeasonTrailer: ${err.message}`);
    throw err;
  }
}

// Movie details with cast endpoint - SILENT VERSION
export const getMovieDetails = async (req, res) => {
  const { type, id } = req.params;
  
  try {
    // For TV shows, get details with credits, videos, and number of seasons
    const details = await safeFetch(`${type}/${id}?append_to_response=credits,videos`);
    
    // For TV shows, also get number of seasons and latest season info
    if (type === 'tv') {
      details.media_type = 'tv';
      details.number_of_seasons = details.number_of_seasons || 1;
      
      // Get latest season number
      const latestSeason = details.number_of_seasons;
      details.latestSeasonInfo = `Season ${latestSeason}`;
    }
    
    res.json(details);
  } catch (err) {
    logger.error(`Error in getMovieDetails: ${err.message}`);
    res.status(500).json({ 
      error: 'Failed to fetch movie details',
      details: err.message
    });
  }
};

export const getTrendingWithTrailers = async (req, res) => {
  try {
    const [moviesData, tvData] = await Promise.all([
      safeFetch('trending/movie/day'),
      safeFetch('trending/tv/day')
    ]);
    
    const allContent = [
      ...(moviesData.results || moviesData || []).slice(0, 3).map(item => ({ ...item, media_type: 'movie' })),
      ...(tvData.results || tvData || []).slice(0, 3).map(item => ({ ...item, media_type: 'tv' }))
    ];
    
    const contentWithTrailers = await Promise.all(
      allContent.map(async (item) => {
        try {
          const videoData = await safeFetch(`${item.media_type}/${item.id}/videos`);
          const videos = videoData.results || videoData || [];
          const hasTrailer = videos.some(v => 
            v.site === 'YouTube' && v.type === 'Trailer'
          );
          return {
            ...item,
            hasTrailer: hasTrailer || false
          };
        } catch (error) {
          return {
            ...item,
            hasTrailer: false
          };
        }
      })
    );
    
    res.json({
      success: true,
      results: contentWithTrailers
    });
    
  } catch (err) {
    logger.error(`Error in getTrendingWithTrailers: ${err.message}`);
    res.status(500).json({ 
      success: false, 
      error: err.message
    });
  }
};

// Update getRecommendedMovies - add media_type - SILENT VERSION
export const getRecommendedMovies = async (req, res) => {
  try {
    const data = await safeFetch('movie/now_playing');
    
    let movies = [];
    if (data.results && Array.isArray(data.results)) {
      movies = data.results.slice(0, 15);
    } else if (Array.isArray(data)) {
      movies = data.slice(0, 15);
    }
    
    // ✅ ADD THIS: Set media_type for recommended movies
    const moviesWithType = movies.map(movie => ({
      ...movie,
      media_type: 'movie' // Explicitly set
    }));
    
    res.json(moviesWithType); // ✅ Return with media_type
  } catch (err) {
    logger.error(`Error in getRecommendedMovies: ${err.message}`);
    res.status(500).json({ 
      error: 'Failed to fetch recommended movies',
      details: err.message
    });
  }
};