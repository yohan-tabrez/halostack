import { trace, SpanStatusCode, type Span, type Attributes } from '@opentelemetry/api'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { BatchSpanProcessor, TracerProvider } from '@opentelemetry/sdk-trace'
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions'

let started = false

/** Lightweight OTLP HTTP tracer — no-op when OTEL_EXPORTER_OTLP_ENDPOINT is unset. */
export function initOtel(serviceName: string) {
  if (started) return
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.replace(/\/$/, '')
  if (!endpoint) return
  started = true

  const provider = new TracerProvider({
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: serviceName }),
    spanProcessors: [
      new BatchSpanProcessor({
        exporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
      }),
    ],
  })
  trace.setGlobalTracerProvider(provider)
}

export async function withSpan<T>(
  name: string,
  attrs: Attributes,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  const tracer = trace.getTracer('halostack')
  return tracer.startActiveSpan(name, { attributes: attrs }, async (span) => {
    try {
      const result = await fn(span)
      span.setStatus({ code: SpanStatusCode.OK })
      return result
    } catch (err) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      })
      if (err instanceof Error) span.recordException(err)
      throw err
    } finally {
      span.end()
    }
  })
}
