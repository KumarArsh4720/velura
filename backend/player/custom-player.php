<?php
// custom-player.php - Minimal player with controls
session_start();

if (!isset($_GET['token'])) {
    header('Location: /browse.html');
    exit;
}

$tokenData = json_decode(base64_decode($_GET['token']), true);

if (!$tokenData || !isset($tokenData['id']) || !isset($tokenData['timestamp'])) {
    die('Invalid token');
}

// Token expiry check
if (time() - intval($tokenData['timestamp']/1000) > 7200) {
    die('Token expired');
}

// Get data
$contentId = $tokenData['id'];
$contentType = $tokenData['type'] ?? 'movie';
$season = $tokenData['season'] ?? 1;
$episode = $tokenData['episode'] ?? 1;
$title = htmlspecialchars($tokenData['title'] ?? 'Watch Now');
$idType = $tokenData['idType'] ?? 'tmdb';

// Build SuperEmbed URL based on content type
$superembedUrl = "/php/player/se_player.php?video_id=" . urlencode($contentId);
$superembedUrl .= "&tmdb=" . ($idType === 'tmdb' ? 1 : 0);

// Only add season/episode for TV shows
if ($contentType === 'tv' || $contentType === 'series') {
    $superembedUrl .= "&season=" . intval($season);
    $superembedUrl .= "&episode=" . intval($episode);
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Velura - <?php echo $title; ?></title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body, html { width: 100%; height: 100%; overflow: hidden; background: #000; }
        
        /* Loading overlay */
        #loading-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: #000;
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 9999;
            transition: opacity 0.5s ease;
        }
        
        #loading-overlay.hidden {
            opacity: 0;
            pointer-events: none;
        }
        
        /* Loading animation styles */
        .loader3 {
          display: flex;
          justify-content: center;
          align-items: center;
        }
        
        .bars {
          width: 10px;
          height: 20px;
          margin: 0 2px;
          border-radius: 4px;
          animation: loader3 3s ease-in-out infinite;
        }
        
        .bar1 {
          background-color: #4285F4;
          animation-delay: -0.8s;
        }
        
        .bar2 {
          background-color: #4285F4;
          animation-delay: -0.7s;
        }
        
        .bar3 {
          background-color: #4285F4;
          animation-delay: -0.6s;
        }
        
        .bar4 {
          background-color: #4285F4;
          animation-delay: -0.5s;
        }
        
        .bar5 {
          background-color: #4285F4;
          animation-delay: -0.4s;
        }
        
        .bar6 {
          background-color: #4285F4;
          animation-delay: -0.3s;
        }
        
        .bar7 {
          background-color: #4285F4;
          animation-delay: -0.2s;
        }
        
        .bar8 {
          background-color: #4285F4;
          animation-delay: -0.1s;
        }
        
        .bar9 {
          background-color: #4285F4;
          animation-delay: 0s;
        }
        
        .bar10 {
          background-color: #4285F4;
          animation-delay: 0.1s;
        }
        
        @keyframes loader3 {
          0% {
            transform: scale(1);
          }
          20% {
            transform: scale(1, 2.32);
          }
          40% {
            transform: scale(1);
          }
        }
        
        /* Minimal controls */
        .controls {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            padding: 20px;
            z-index: 10000;
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: linear-gradient(to bottom, rgba(0,0,0,0.8), transparent);
            opacity: 0;
            transition: opacity 0.3s;
            pointer-events: none;
        }
        
        .controls:hover {
            opacity: 1;
        }
        
        .controls > * {
            pointer-events: auto;
        }
        
        .back-btn {
            background: rgba(0,0,0,0.6);
            border: 1px solid rgba(255,255,255,0.2);
            color: white;
            width: 50px;
            height: 50px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            cursor: pointer;
            text-decoration: none;
        }
        
        .title-area {
            color: white;
            text-align: center;
            flex: 1;
            padding: 0 20px;
        }
        
        iframe {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            border: none;
            z-index: 1;
            opacity: 0;
            transition: opacity 0.3s ease;
        }
        
        iframe.loaded {
            opacity: 1;
        }
    </style>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
</head>
<body>
    <!-- Loading overlay -->
    <div id="loading-overlay">
        <div class="loader3">
            <div class="bars bar1"></div>
            <div class="bars bar2"></div>
            <div class="bars bar3"></div>
            <div class="bars bar4"></div>
            <div class="bars bar5"></div>
            <div class="bars bar6"></div>
            <div class="bars bar7"></div>
            <div class="bars bar8"></div>
            <div class="bars bar9"></div>
            <div class="bars bar10"></div>
        </div>
    </div>
    
    <div class="controls">
        <a href="/browse.html" class="back-btn" title="Go Back">
            <i class="fas fa-arrow-left"></i>
        </a>
        
        <div class="title-area">
            <?php echo $title; ?>
            <?php if ($contentType === 'tv' || $contentType === 'series'): ?>
                <div style="color: #00d4ff; font-size: 14px;">
                    S<?php echo $season; ?>E<?php echo $episode; ?>
                </div>
            <?php endif; ?>
        </div>
    </div>
    
    <iframe 
        id="playerFrame"
        src="<?php echo $superembedUrl; ?>"
        allowfullscreen 
        webkitallowfullscreen 
        mozallowfullscreen>
    </iframe>
    
    <script>
        const playerFrame = document.getElementById('playerFrame');
        const loadingOverlay = document.getElementById('loading-overlay');
        
        // Hide loading overlay when iframe loads
        playerFrame.addEventListener('load', function() {
            // Add a small delay to ensure player is fully loaded
            setTimeout(() => {
                loadingOverlay.classList.add('hidden');
                playerFrame.classList.add('loaded');
            }, 500); // Adjust this delay if needed
        });
        
        // Show loading if iframe fails to load
        playerFrame.addEventListener('error', function() {
            loadingOverlay.innerHTML = '<div style="color: white; text-align: center; padding: 20px;"><h3>Failed to load player</h3><p>Please try again or check your connection.</p></div>';
        });
        
        // Fullscreen functionality
        const fullscreenBtn = document.getElementById('fullscreenBtn');
        let isFullscreen = false;
        
        function toggleFullscreen() {
            if (!isFullscreen) {
                enterFullscreen();
            } else {
                exitFullscreen();
            }
        }
        
        function enterFullscreen() {
            const elem = document.documentElement;
            
            if (elem.requestFullscreen) {
                elem.requestFullscreen();
            } else if (elem.webkitRequestFullscreen) {
                elem.webkitRequestFullscreen();
            } else if (elem.mozRequestFullScreen) {
                elem.mozRequestFullScreen();
            } else if (elem.msRequestFullscreen) {
                elem.msRequestFullscreen();
            }
            
            isFullscreen = true;
            fullscreenBtn.innerHTML = '<i class="fas fa-compress"></i>';
        }
        
        function exitFullscreen() {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.mozCancelFullScreen) {
                document.mozCancelFullScreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
            
            isFullscreen = false;
            fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
        }
        
        if (fullscreenBtn) {
            fullscreenBtn.addEventListener('click', toggleFullscreen);
        }
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'f' || e.key === 'F') {
                e.preventDefault();
                toggleFullscreen();
            }
            if (e.key === 'Escape' && isFullscreen) {
                exitFullscreen();
            }
        });
        
        // Fullscreen change detection
        document.addEventListener('fullscreenchange', updateFullscreenState);
        document.addEventListener('webkitfullscreenchange', updateFullscreenState);
        document.addEventListener('mozfullscreenchange', updateFullscreenState);
        
        function updateFullscreenState() {
            isFullscreen = !!(document.fullscreenElement || 
                            document.webkitFullscreenElement || 
                            document.mozFullScreenElement);
            
            if (fullscreenBtn) {
                fullscreenBtn.innerHTML = isFullscreen ? 
                    '<i class="fas fa-compress"></i>' : 
                    '<i class="fas fa-expand"></i>';
            }
        }
        
        // Auto-hide controls
        let controlsTimeout;
        function showControls() {
            document.querySelector('.controls').style.opacity = '1';
            clearTimeout(controlsTimeout);
            controlsTimeout = setTimeout(() => {
                if (!isFullscreen) {
                    document.querySelector('.controls').style.opacity = '0';
                }
            }, 3000);
        }
        
        document.addEventListener('mousemove', showControls);
        document.addEventListener('keydown', showControls);
        
        // Initial show
        showControls();
    </script>
</body>
</html>