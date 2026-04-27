import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAppSettings } from "@/hooks/useAppSettings";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { MonitorPlay, Moon, Play, Sun, BookOpen, Download } from "lucide-react";
import { toast } from "sonner";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { LoginParticles } from "@/components/LoginParticles";
import { CursorGlow } from "@/components/CursorGlow";
import { LoginRestoreButton } from "@/components/LoginRestoreButton";
import { supabase } from "@/integrations/supabase/client";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [videoBlocked, setVideoBlocked] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const { signIn } = useAuth();
  const { settings } = useAppSettings();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);

  const hasMedia = !!settings.login_video_url;
  const isImageMedia = hasMedia && /\.(jpe?g|gif)(\?.*)?$/i.test(settings.login_video_url);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("bootstrap-admin", {
          body: { action: "check" },
        });
        if (!cancelled && !error && data?.has_admin === false) {
          navigate("/admin/first-login", { replace: true });
        }
      } catch {
        // Keep the login page available if the backend is unreachable.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  useEffect(() => {
    const video = videoRef.current;
    if (!hasMedia || isImageMedia || !video) return;

    setVideoError(false);
    video.playsInline = true;

    const tryPlay = async () => {
      try {
        await video.play();
        setVideoBlocked(false);
      } catch {
        setVideoBlocked(true);
      }
    };

    const onCanPlay = () => {
      void tryPlay();
    };

    video.addEventListener("canplay", onCanPlay);
    void tryPlay();

    return () => {
      video.removeEventListener("canplay", onCanPlay);
    };
  }, [hasMedia, isImageMedia, settings.login_video_url]);

  const handleManualPlay = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      await video.play();
      setVideoBlocked(false);
    } catch {
      setVideoBlocked(true);
      toast.error("Impossible de lancer la vidéo");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signIn(email, password);
      navigate("/");
    } catch (err: any) {
      toast.error(err.message || "Erreur de connexion");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex relative overflow-hidden bg-background">
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleTheme}
        className="absolute top-4 right-4 z-20 h-9 w-9 text-muted-foreground hover:text-primary backdrop-blur-sm bg-card/30 border border-border/30"
      >
        {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>

      <div className={`relative flex items-center justify-center p-6 w-full ${hasMedia ? "md:w-1/2" : ""}`}>
        <AnimatedBackground />
        <LoginParticles />

        <CursorGlow className="w-full max-w-md">
        <Card className="login-card w-full p-8 space-y-6 relative z-10 border-primary/10 shadow-glow-blue">
          <div className="absolute inset-0 rounded-[inherit] p-px bg-gradient-to-br from-primary/20 via-transparent to-accent/20 pointer-events-none -z-[1]" />

          <div className="flex flex-col items-center gap-3 login-header">
            {settings.logo_url ? (
              <img
                src={settings.logo_url}
                alt={settings.app_name}
                className="h-14 w-14 rounded-xl object-contain login-logo-pulse"
              />
            ) : (
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/10 flex items-center justify-center login-logo-pulse border border-primary/20">
                <MonitorPlay className="h-9 w-9 text-primary icon-neon" />
              </div>
            )}
            <h1 className="text-2xl font-bold tracking-widest gradient-primary-text">
              {settings.app_name.toUpperCase()}
            </h1>
            <p className="text-sm text-muted-foreground normal-case tracking-normal">
              {settings.welcome_message}
            </p>

            <div className="flex items-center gap-2 text-xs text-muted-foreground/60">
              <span className="status-dot-live w-1.5 h-1.5 rounded-full bg-status-online inline-block" />
              <span>Système connecté</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 login-form-fields">
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Email
              </label>
              <Input
                type="email"
                placeholder="vous@exemple.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="login-input-focus bg-background/50 backdrop-blur-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Mot de passe
              </label>
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="login-input-focus bg-background/50 backdrop-blur-sm"
              />
            </div>
            <Button
              type="submit"
              className="w-full login-btn-hover gradient-primary text-primary-foreground font-semibold"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="login-spinner" />
                  Connexion...
                </span>
              ) : (
                "Se connecter"
              )}
            </Button>
          </form>

          <div className="text-center text-sm space-y-2 normal-case login-footer">
            <Link
              to="/forgot-password"
              className="text-primary hover:underline block transition-colors duration-200"
            >
              Mot de passe oublié ?
            </Link>
            <p className="text-muted-foreground">
              Pas encore de compte ?{" "}
              <Link to="/register" className="text-primary hover:underline transition-colors duration-200">
                S'inscrire
              </Link>
            </p>
          </div>

          <div className="flex items-center justify-center gap-3 pt-2 border-t border-border/30">
            <Link to="/manual">
              <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground hover:text-primary">
                <BookOpen className="h-3.5 w-3.5" />
                Consulter le Manuel
              </Button>
            </Link>
          </div>
        </Card>
        </CursorGlow>
      </div>

      {hasMedia && (
        <div className="hidden md:flex md:w-1/2 items-center justify-center p-8 bg-gradient-to-br from-background via-secondary/20 to-background">
          <div className="relative w-full max-w-3xl aspect-video rounded-2xl overflow-hidden bg-card/30 backdrop-blur-sm border border-primary/30 shadow-neon neon-border">
            {isImageMedia ? (
              <img
                src={settings.login_video_url}
                alt="Login media"
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : (
              <>
                <video
                  ref={videoRef}
                  src={settings.login_video_url}
                  autoPlay
                  loop
                  playsInline
                  preload="auto"
                  className="absolute inset-0 w-full h-full object-cover"
                  onLoadedData={() => setVideoError(false)}
                  onError={() => {
                    setVideoError(true);
                    setVideoBlocked(false);
                  }}
                />

                {videoBlocked && !videoError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/60 backdrop-blur-sm">
                    <p className="text-sm text-foreground font-medium">Lecture vidéo bloquée par le navigateur</p>
                    <Button onClick={handleManualPlay} className="gap-2 gradient-primary text-primary-foreground">
                      <Play className="h-4 w-4" />
                      Lancer la vidéo
                    </Button>
                  </div>
                )}

                {videoError && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                    <p className="text-sm text-muted-foreground">Impossible de charger la vidéo</p>
                  </div>
                )}
              </>
            )}

            <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-background/40 via-transparent to-background/20" />
          </div>
        </div>
      )}

      <LoginRestoreButton />
    </div>
  );
}
