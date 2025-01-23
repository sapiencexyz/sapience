import {
  DiscordLogoIcon,
  GitHubLogoIcon,
  TwitterLogoIcon,
} from '@radix-ui/react-icons';
import { Button } from '@/components/ui/button';

export const Footer = () => {
  return (
    <footer className="relative m-4 mt-12 rounded-4xl bg-primary py-16 text-center md:m-14">
      <div className="absolute inset-0 bg-[url('../../../public/assets/dotgrid.svg')] bg-[length:45px_45px] bg-repeat opacity-[0.33]" />
      <div className="relative flex justify-center gap-8">
        <Button
          size="icon"
          asChild
          className="border border-white/50 bg-white/5 hover:text-primary"
        >
          <a
            href="https://discord.gg/foil"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Discord"
          >
            <DiscordLogoIcon className="h-5 w-5 text-white opacity-70" />
          </a>
        </Button>

        <Button
          size="icon"
          asChild
          className="border border-white/50 bg-white/5 hover:text-primary"
        >
          <a
            href="https://twitter.com/foilxyz"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Twitter"
          >
            <TwitterLogoIcon className="h-5 w-5 text-white opacity-70" />
          </a>
        </Button>

        <Button
          size="icon"
          asChild
          className="border border-white/50 bg-white/5 hover:text-primary"
        >
          <a
            href="https://github.com/foilxyz"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
          >
            <GitHubLogoIcon className="h-5 w-5 text-white opacity-70" />
          </a>
        </Button>
      </div>
    </footer>
  );
};
