import CoreGraphics
import Foundation

/// A JSON value. The protocol's messages are small, loosely shaped objects, so the helper reads and writes them
/// through one value type instead of a Codable struct per message: unknown fields can then be refused by name,
/// which a synthesised Codable decoder would silently drop.
enum JSON: Codable, Equatable, Sendable {
  case null
  case bool(Bool)
  case number(Double)
  case string(String)
  case array([JSON])
  case object([String: JSON])

  init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    if container.decodeNil() {
      self = .null
    } else if let value = try? container.decode(Bool.self) {
      self = .bool(value)
    } else if let value = try? container.decode(Double.self) {
      self = .number(value)
    } else if let value = try? container.decode(String.self) {
      self = .string(value)
    } else if let value = try? container.decode([JSON].self) {
      self = .array(value)
    } else {
      self = .object(try container.decode([String: JSON].self))
    }
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .null: try container.encodeNil()
    case .bool(let value): try container.encode(value)
    case .number(let value):
      // Whole numbers go out without a fraction, so ids and pixel sizes read back as integers.
      if value.rounded() == value, abs(value) < 9_007_199_254_740_992 {
        try container.encode(Int64(value))
      } else {
        try container.encode(value)
      }
    case .string(let value): try container.encode(value)
    case .array(let value): try container.encode(value)
    case .object(let value): try container.encode(value)
    }
  }

  var string: String? {
    if case .string(let value) = self { return value }
    return nil
  }

  var number: Double? {
    if case .number(let value) = self, value.isFinite { return value }
    return nil
  }

  /// An integer only when the number has no fraction; 1.5 is not an integer.
  var integer: Int? {
    guard let value = number, value.rounded() == value, abs(value) <= Double(Int32.max) else { return nil }
    return Int(value)
  }

  var bool: Bool? {
    if case .bool(let value) = self { return value }
    return nil
  }

  var array: [JSON]? {
    if case .array(let value) = self { return value }
    return nil
  }

  var object: [String: JSON]? {
    if case .object(let value) = self { return value }
    return nil
  }

  static func int(_ value: Int) -> JSON { .number(Double(value)) }
  static func double(_ value: Double) -> JSON { .number(value) }
  static func optionalString(_ value: String?) -> JSON { value.map { .string($0) } ?? .null }

  static func point(_ point: CGPoint) -> JSON {
    .object(["x": .number(Double(point.x)), "y": .number(Double(point.y))])
  }

  static func size(_ size: CGSize) -> JSON {
    .object(["width": .number(Double(size.width)), "height": .number(Double(size.height))])
  }

  static func rect(_ rect: CGRect) -> JSON {
    .object([
      "x": .number(Double(rect.origin.x)), "y": .number(Double(rect.origin.y)),
      "width": .number(Double(rect.size.width)), "height": .number(Double(rect.size.height)),
    ])
  }
}

enum JSONCoding {
  static let encoder: JSONEncoder = {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
    return encoder
  }()

  /// One protocol line: the JSON text and a newline. JSONEncoder escapes control characters inside strings, so the
  /// only newline in the output is the terminator.
  static func line(_ value: JSON) -> Data {
    var data = (try? encoder.encode(value)) ?? Data("{\"ok\":false,\"code\":\"failed\",\"message\":\"encoding failed\"}".utf8)
    data.append(0x0A)
    return data
  }

  static func decode(_ data: Data) -> JSON? {
    try? JSONDecoder().decode(JSON.self, from: data)
  }
}
