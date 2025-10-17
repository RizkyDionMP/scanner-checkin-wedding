const API_URL = window.location.origin;
console.log("API base URL:", API_URL);
        let html5QrcodeScanner;
        let isProcessing = false;
        let sessionCheckins = 0; // Counter untuk session ini

        // Initialize scanner
        function initScanner() {
            html5QrcodeScanner = new Html5QrcodeScanner(
                "reader",
                { 
                    fps: 10, 
                    qrbox: { width: 250, height: 250 },
                    aspectRatio: 1.0
                },
                false
            );

            html5QrcodeScanner.render(onScanSuccess, onScanError);
            
            document.getElementById('cameraStatus').textContent = 'Arahkan QR code ke kamera';
        }

        // On scan success
        async function onScanSuccess(decodedText, decodedResult) {
            if (isProcessing) return;
            
            isProcessing = true;
            console.log(`QR Code detected: ${decodedText}`);
            
            // Pause scanner
            html5QrcodeScanner.pause(true);
            
            await processCheckin(decodedText);
            
            // Resume scanner after 3 seconds
            setTimeout(() => {
                html5QrcodeScanner.resume();
                isProcessing = false;
            }, 3000);
        }

        // On scan error (silent)
        function onScanError(error) {
            // Ignore scanning errors
        }

        // Process check-in
        async function processCheckin(qrValue) {
            const resultDiv = document.getElementById('result');
            
            // Show loading
            resultDiv.innerHTML = `
                <div class="result-card" style="background: #667eea; color: white; text-align: center;">
                    <div class="loading"></div>
                    <p style="margin-top: 10px;">Memproses check-in...</p>
                </div>
            `;

            try {
                const response = await fetch(`${API_URL}/api/checkin`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ qrValue: qrValue.trim() })
                });

                const data = await response.json();

                if (data.success) {
                    // Success - increment counter
                    sessionCheckins++;
                    updateCheckinCounter();
                    
                    resultDiv.innerHTML = `
                        <div class="result-card result-success">
                            <h2>
                                <span class="icon">✓</span>
                                Check-in Berhasil!
                            </h2>
                            <div class="result-info">
                                <p><strong>Nama:</strong> <span>${data.nama}</span></p>
                                <p><strong>Instansi:</strong> <span>${data.instansi}</span></p>
                                <p><strong>Waktu:</strong> <span>${data.waktuCheckin}</span></p>
                            </div>
                        </div>
                    `;
                    playSuccessSound();
                    
                    // Highlight animation
                    highlightCheckinStat();
                    
                } else if (data.sudahCheckin) {
                    // Already checked in
                    resultDiv.innerHTML = `
                        <div class="result-card result-warning">
                            <h2>
                                <span class="icon">⚠</span>
                                Sudah Check-in
                            </h2>
                            <div class="result-info">
                                <p><strong>Nama:</strong> <span>${data.nama}</span></p>
                                <p><strong>Instansi:</strong> <span>${data.instansi}</span></p>
                                <p><strong>Check-in:</strong> <span>${data.waktuCheckin}</span></p>
                                <p style="margin-top: 10px; font-size: 14px;">${data.message}</p>
                            </div>
                        </div>
                    `;
                } else {
                    // Error/Not found
                    resultDiv.innerHTML = `
                        <div class="result-card result-error">
                            <h2>
                                <span class="icon">✕</span>
                                Check-in Gagal
                            </h2>
                            <div class="result-info">
                                <p>${data.message}</p>
                                <p style="margin-top: 10px; font-size: 14px;">QR Code: ${qrValue}</p>
                            </div>
                        </div>
                    `;
                }

            } catch (error) {
                console.error('Error:', error);
                resultDiv.innerHTML = `
                    <div class="result-card result-error">
                        <h2>
                            <span class="icon">✕</span>
                            Error Koneksi
                        </h2>
                        <div class="result-info">
                            <p>Tidak dapat terhubung ke server</p>
                            <p style="margin-top: 10px; font-size: 14px;">Pastikan server sudah berjalan</p>
                        </div>
                    </div>
                `;
            }
        }

        // Manual check-in
        async function manualCheckin() {
            const qrValue = document.getElementById('manualQR').value.trim();
            
            if (!qrValue) {
                alert('Mohon masukkan kode QR');
                return;
            }

            await processCheckin(qrValue);
            document.getElementById('manualQR').value = '';
        }

        // Update check-in counter (hanya yang berhasil check-in di session ini)
        function updateCheckinCounter() {
            const checkedInEl = document.getElementById('checkedIn');
            checkedInEl.textContent = sessionCheckins;
        }

        // Highlight check-in stat with animation
        function highlightCheckinStat() {
            const card = document.getElementById('checkedInCard');
            card.classList.add('highlight');
            
            setTimeout(() => {
                card.classList.remove('highlight');
            }, 2000);
        }

        // Load total guests only (not checked-in count)
        async function loadTotalGuests() {
            try {
                const response = await fetch(`${API_URL}/api/guests`);
                const data = await response.json();

                if (data.success) {
                    document.getElementById('totalGuests').textContent = data.total;
                    // Jangan update checked-in counter dari server
                }
            } catch (error) {
                console.error('Error loading total guests:', error);
                document.getElementById('totalGuests').textContent = '-';
            }
        }

        // Play success sound (optional)
        function playSuccessSound() {
            try {
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();

                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);

                oscillator.frequency.value = 800;
                oscillator.type = 'sine';

                gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

                oscillator.start(audioContext.currentTime);
                oscillator.stop(audioContext.currentTime + 0.5);
            } catch (e) {
                // Ignore audio errors
            }
        }

        // Allow Enter key for manual input
        document.getElementById('manualQR').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                manualCheckin();
            }
        });

        // Initialize when page loads
        window.addEventListener('load', () => {
            initScanner();
            loadTotalGuests(); // Hanya load total tamu
            
            // Reset counter untuk session baru
            sessionCheckins = 0;
            updateCheckinCounter();

        });


