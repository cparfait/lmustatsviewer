import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Home, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted/40">
        <Compass className="h-6 w-6 text-muted-foreground" />
      </div>
      <h1 className="text-2xl font-semibold">404</h1>
      <p className="mt-1 text-base font-medium">{t("notFound.title")}</p>
      <p className="mt-2 text-sm text-muted-foreground">{t("notFound.desc")}</p>
      <Button asChild className="mt-5">
        <Link to="/">
          <Home className="h-4 w-4" />
          {t("notFound.home")}
        </Link>
      </Button>
    </div>
  );
}
