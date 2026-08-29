import { WelcomeScreen } from "./WelcomeScreen";
import { HROrientationChat } from "./HROrientationChat";
import { Wallpaper } from "../desktop/Wallpaper";

/** Combined pre-Day-1 screen: a static recap panel on the left (with the
 * button that starts the day) next to Sam's live chat on the right. Both
 * are visible at once so the player can read and ask questions in either
 * order, as much or as little as they want, before starting. Renders the
 * same Wallpaper as the main desktop (at dayProgress 0, its sunrise state)
 * — the sky/mountain/sun art lives in that one shared component now, not
 * in the pixel-desktop-bg CSS class, so it has to be rendered explicitly
 * here too or this screen loses its background entirely. */
export function OnboardingScreen({ onStart }: { onStart: (name: string) => void }) {
  return (
    <div className="pixel-desktop-bg relative flex h-dvh w-full items-center justify-center p-4">
      <Wallpaper dayProgress={0} />
      <div className="relative grid h-[640px] max-h-[90vh] w-full max-w-5xl grid-cols-1 gap-4 md:grid-cols-2">
        <WelcomeScreen onStart={onStart} />
        <HROrientationChat />
      </div>
    </div>
  );
}
