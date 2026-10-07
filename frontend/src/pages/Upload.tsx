import { useTranslation } from "react-i18next";
import UploadZone from "../components/UploadZone";

export default function Upload() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <header><p className="eyebrow">{t("nav.upload")}</p><h1 className="h-display mt-1 text-3xl font-semibold">{t("uploadTitle")}</h1></header>
      <UploadZone />
    </div>
  );
}
