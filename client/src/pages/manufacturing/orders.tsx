import ManufacturingLayout from "@/components/manufacturing-layout";
import ManufacturingList from "@/pages/inventory/manufacturing-list";

export default function MfgOrdersPage() {
  return <ManufacturingList Wrapper={ManufacturingLayout} basePath="/manufacturing/orders" />;
}
