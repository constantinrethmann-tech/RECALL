import { Brain, Cards, Gear, Upload } from "./icons";
import { IconLink } from "./ui";

/** Top-right links: browse/add cards, brain dump, import, settings. */
export function AppNav() {
  return (
    <nav className="flex items-center">
      <IconLink href="/cards/" label="Browse & add cards">
        <Cards />
      </IconLink>
      <IconLink href="/braindump/" label="Brain dump">
        <Brain />
      </IconLink>
      <IconLink href="/import/" label="Import a deck">
        <Upload />
      </IconLink>
      <IconLink href="/settings/" label="Settings">
        <Gear />
      </IconLink>
    </nav>
  );
}
