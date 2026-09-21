import type { Diagram } from './Diagram.ts'
import { MessagePart } from './MessagePart.ts'

/** A message part that points at a Diagram owned by the Project. */
export class DiagramReference extends MessagePart {
  diagram: Diagram

  constructor(diagram: Diagram) {
    super('diagram-reference', diagram.name)
    this.diagram = diagram
  }

  render(): string {
    return this.diagram.render()
  }
}
