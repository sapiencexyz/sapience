import {
  DiscordLogoIcon,
  GitHubLogoIcon,
  TwitterLogoIcon,
} from '@radix-ui/react-icons';
import { Button } from '@/components/ui/button';

export const Footer = () => {
  return (
    <footer className="py-6 text-center">
      <div className="flex justify-center gap-4">
        <Button
          variant="outline"
          size="icon"
          asChild
          className="hover:text-primary"
        >
          <a
            href="https://discord.gg/foil"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Discord"
          >
            <DiscordLogoIcon className="h-5 w-5" />
          </a>
        </Button>

        <Button
          variant="outline"
          size="icon"
          asChild
          className="hover:text-primary"
        >
          <a
            href="https://twitter.com/foilxyz"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Twitter"
          >
            <TwitterLogoIcon className="h-5 w-5" />
          </a>
        </Button>

        <Button
          variant="outline"
          size="icon"
          asChild
          className="hover:text-primary"
        >
          <a
            href="https://github.com/foilxyz"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
          >
            <GitHubLogoIcon className="h-5 w-5" />
          </a>
        </Button>
      </div>
    </footer>
  );
};
