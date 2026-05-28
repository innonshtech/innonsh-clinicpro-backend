import { getApiDocs } from '@/utils/swagger';
import SwaggerUIBlock from './SwaggerUIBlock';

export default async function ApiDocPage() {
  const spec = await getApiDocs();
  return (
    <section className="bg-white min-h-screen">
      <SwaggerUIBlock spec={spec} />
    </section>
  );
}
