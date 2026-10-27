/* Opt-in, turn-based voice support. Recordings are transient; transcripts are durable. */
(() => {
  let current;
  window.CueVoice = {
    async open(context = {}, onUpdate = () => {}) {
      if (current) return current.focus();
      const dialog = document.createElement("dialog");
      dialog.className = "cue-voice";
      dialog.setAttribute("aria-label", "Voice support with Cue");
      dialog.innerHTML =
        '<h2>Talk to Cue</h2><p class="cue-voice-disclosure">You are speaking with an AI assistant. Audio is sent to Google Gemini for transcription. Transcripts and replies are saved in your support case; Cue does not store raw audio.</p><label class="cue-voice-consent"><input type="checkbox"> I agree to start voice support</label><div class="cue-voice-log" aria-live="polite"></div><p class="cue-voice-status" role="status">Speak in short turns. You can interrupt or end at any time.</p><div class="cue-voice-actions"><button type="button" class="cue-voice-record" disabled>Record a message</button><button type="button" class="cue-voice-end">End session</button></div>';
      document.body.append(dialog);
      dialog.showModal();
      current = dialog;
      const status = dialog.querySelector(".cue-voice-status"),
        record = dialog.querySelector(".cue-voice-record"),
        consent = dialog.querySelector("input"),
        log = dialog.querySelector(".cue-voice-log");
      let sessionId,
        recorder,
        stream,
        timer,
        closing = false,
        busy = false;
      async function call(action, extra = {}) {
        const response = await fetch("/api/voice", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action, sessionId, ...context, ...extra }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Voice request failed");
        return data;
      }
      function stopTracks() {
        clearTimeout(timer);
        stream?.getTracks().forEach((track) => track.stop());
        stream = undefined;
      }
      async function close() {
        if (closing) return;
        closing = true;
        if (recorder?.state === "recording") recorder.stop();
        stopTracks();
        window.speechSynthesis?.cancel();
        dialog.close();
        dialog.remove();
        current = undefined;
        if (sessionId) await call("end").catch(() => {});
        onUpdate();
      }
      dialog.querySelector(".cue-voice-end").onclick = close;
      dialog.addEventListener("cancel", (e) => {
        e.preventDefault();
        void close();
      });
      consent.onchange = async () => {
        if (!consent.checked) {
          record.disabled = true;
          void close();
          return;
        }
        try {
          if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
            throw new Error(
              "This browser cannot record audio. Please use support chat.",
            );
          if (!sessionId)
            sessionId = (await call("start", { consent: true })).sessionId;
          if (closing) {
            await call("end").catch(() => {});
          } else if (consent.checked) {
            record.disabled = false;
            status.textContent =
              "Ready. Record a message, then press Send recording.";
          }
        } catch (e) {
          consent.checked = false;
          status.textContent = e.message;
        }
      };
      record.onclick = async () => {
        if (busy || closing || !sessionId || !consent.checked) return;
        if (recorder?.state === "recording") {
          recorder.stop();
          return;
        }
        window.speechSynthesis?.cancel();
        record.disabled = true;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          if (closing || !consent.checked) {
            stopTracks();
            return;
          }
          const mimeType = [
            "audio/webm;codecs=opus",
            "audio/ogg;codecs=opus",
            "audio/webm",
          ].find((type) => MediaRecorder.isTypeSupported(type));
          if (!mimeType)
            throw new Error(
              "This browser's recording format is unsupported. Please use support chat.",
            );
          recorder = new MediaRecorder(stream, { mimeType });
          const chunks = [];
          recorder.ondataavailable = (e) => {
            if (e.data.size) chunks.push(e.data);
          };
          recorder.onerror = () => {
            stopTracks();
            record.disabled = false;
            record.textContent = "Record a message";
            status.textContent = "Recording failed. Please try again.";
          };
          recorder.onstop = async () => {
            stopTracks();
            record.textContent = "Record a message";
            if (closing || !consent.checked) return;
            busy = true;
            record.disabled = true;
            status.textContent = "Transcribing and preparing your reply…";
            try {
              const blob = new Blob(chunks, { type: mimeType });
              if (blob.size > 3 * 1024 * 1024)
                throw new Error("Recording must be under 3 MB");
              const audio = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () =>
                  resolve(String(reader.result).split(",")[1]);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              });
              const data = await call("turn", {
                audio,
                mimeType,
                key: crypto.randomUUID(),
              });
              if (closing) return;
              for (const [author, text] of [
                ["You", data.transcript],
                ["Cue", data.reply],
              ]) {
                const bubble = document.createElement("p"),
                  label = document.createElement("strong");
                label.textContent = author + ": ";
                bubble.append(label, document.createTextNode(text));
                log.append(bubble);
              }
              log.scrollTop = log.scrollHeight;
              onUpdate();
              status.textContent =
                "Saved to your support conversation. Record another message whenever you’re ready.";
              if (window.speechSynthesis && window.SpeechSynthesisUtterance) {
                const speech = new SpeechSynthesisUtterance(data.reply);
                speech.rate = 1;
                speech.onerror = () => {
                  if (!closing)
                    status.textContent =
                      "Reply saved. Voice playback unavailable; read it above.";
                };
                window.speechSynthesis.speak(speech);
              }
            } catch (e) {
              if (!closing)
                status.textContent =
                  e.message || "Voice request failed. Please try again.";
            } finally {
              busy = false;
              if (!closing) record.disabled = !consent.checked;
            }
          };
          recorder.start();
          record.disabled = false;
          record.textContent = "Send recording";
          status.textContent = "Listening… recordings stop after 30 seconds.";
          timer = setTimeout(() => {
            if (recorder.state === "recording") recorder.stop();
          }, 30_000);
        } catch (e) {
          stopTracks();
          record.disabled = false;
          status.textContent =
            e.name === "NotAllowedError"
              ? "Microphone permission was denied. You can use support chat instead."
              : e.message;
        }
      };
    },
  };
})();
