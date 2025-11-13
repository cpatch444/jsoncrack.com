import React from "react";
import type { ModalProps } from "@mantine/core";
import { Modal, Stack, Text, ScrollArea, Flex, CloseButton, Button, Textarea } from "@mantine/core";
import { CodeHighlight } from "@mantine/code-highlight";
import toast from "react-hot-toast";
import type { NodeData } from "../../../types/graph";
import useGraph from "../../editor/views/GraphView/stores/useGraph";
import useJson from "../../../store/useJson";
import useFile from "../../../store/useFile";
import type { JSONPath } from "jsonc-parser";

// return object from json removing array and object fields
const normalizeNodeData = (nodeRows: NodeData["text"]) => {
  if (!nodeRows || nodeRows.length === 0) return "{}";
  if (nodeRows.length === 1 && !nodeRows[0].key) return `${nodeRows[0].value}`;

  const obj = {};
  nodeRows?.forEach(row => {
    if (row.type !== "array" && row.type !== "object") {
      if (row.key) obj[row.key] = row.value;
    }
  });
  return JSON.stringify(obj, null, 2);
};

// return json path in the format $["customer"]
const jsonPathToString = (path?: NodeData["path"]) => {
  if (!path || path.length === 0) return "$";
  const segments = path.map(seg => (typeof seg === "number" ? seg : `"${seg}"`));
  return `$[${segments.join("][")}]`;
};

// Update JSON at a specific path
const updateJsonAtPath = (json: any, path: JSONPath, newValue: any): any => {
  if (!path || path.length === 0) {
    return newValue;
  }

  const [first, ...rest] = path;
  
  // Create a deep copy to avoid mutating the original
  const result = Array.isArray(json) ? [...json] : { ...json };

  if (rest.length === 0) {
    // We're at the target path, update the value
    if (Array.isArray(result)) {
      const index = first as number;
      if (index >= 0 && index < result.length) {
        result[index] = newValue;
      }
    } else {
      result[first as string] = newValue;
    }
  } else {
    // Continue traversing the path
    if (Array.isArray(result)) {
      const index = first as number;
      if (index >= 0 && index < result.length) {
        result[index] = updateJsonAtPath(result[index], rest, newValue);
      }
    } else if (result && typeof result === "object") {
      result[first as string] = updateJsonAtPath(result[first as string], rest, newValue);
    }
  }

  return result;
};

export const NodeModal = ({ opened, onClose }: ModalProps) => {
  const nodeData = useGraph(state => state.selectedNode);
  const getJson = useJson(state => state.getJson);
  const setJson = useJson(state => state.setJson);
  const [isEditing, setIsEditing] = React.useState(false);
  const [editedContent, setEditedContent] = React.useState("");

  // Initialize edited content when node data changes or modal opens
  React.useEffect(() => {
    if (opened && nodeData) {
      setEditedContent(normalizeNodeData(nodeData.text));
      setIsEditing(false);
    }
  }, [opened, nodeData]);

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancel = () => {
    if (nodeData) {
      setEditedContent(normalizeNodeData(nodeData.text));
    }
    setIsEditing(false);
  };

  const handleSave = () => {
    if (!nodeData?.path) {
      toast.error("Cannot update: node path is missing");
      return;
    }

    try {
      // Parse the edited content
      // Handle both JSON objects/arrays and primitive values
      let newValue: any;
      try {
        newValue = JSON.parse(editedContent);
      } catch {
        // If parsing fails, try to parse as a quoted string or number
        const trimmed = editedContent.trim();
        if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
          newValue = JSON.parse(trimmed);
        } else if (trimmed === "null") {
          newValue = null;
        } else if (trimmed === "true") {
          newValue = true;
        } else if (trimmed === "false") {
          newValue = false;
        } else if (!isNaN(Number(trimmed)) && trimmed !== "") {
          newValue = Number(trimmed);
        } else {
          // Treat as unquoted string
          newValue = trimmed;
        }
      }

      // Get current JSON
      const currentJson = JSON.parse(getJson());

      // Update JSON at the specific path
      const updatedJson = updateJsonAtPath(currentJson, nodeData.path, newValue);

      // Convert to formatted JSON string
      const updatedJsonString = JSON.stringify(updatedJson, null, 2);

      // Update the JSON store (this will trigger graph regeneration)
      setJson(updatedJsonString);

      // Update the file contents on the left side editor
      useFile.getState().setContents({ contents: updatedJsonString, hasChanges: true });

      toast.success("Node updated successfully");
      setIsEditing(false);
    } catch (error) {
      if (error instanceof Error) {
        toast.error(`Invalid JSON: ${error.message}`);
      } else {
        toast.error("Invalid JSON format");
      }
    }
  };

  return (
    <Modal size="auto" opened={opened} onClose={onClose} centered withCloseButton={false}>
      <Stack pb="sm" gap="sm">
        <Stack gap="xs">
          <Flex justify="space-between" align="center">
            <Text fz="xs" fw={500}>
              Content
            </Text>
            <Flex gap="xs" align="center">
              {isEditing ? (
                <>
                  <Button size="xs" variant="light" color="green" onClick={handleSave}>
                    Save
                  </Button>
                  <Button size="xs" variant="light" color="gray" onClick={handleCancel}>
                    Cancel
                  </Button>
                </>
              ) : (
                <Button size="xs" variant="light" onClick={handleEdit}>
                  Edit
                </Button>
              )}
              <CloseButton onClick={onClose} />
            </Flex>
          </Flex>
          <ScrollArea.Autosize mah={250} maw={600}>
            {isEditing ? (
              <Textarea
                value={editedContent}
                onChange={e => setEditedContent(e.target.value)}
                minRows={8}
                styles={{
                  input: {
                    fontFamily: "monospace",
                    fontSize: "13px",
                  },
                }}
              />
            ) : (
              <CodeHighlight
                code={normalizeNodeData(nodeData?.text ?? [])}
                miw={350}
                maw={600}
                language="json"
                withCopyButton
              />
            )}
          </ScrollArea.Autosize>
        </Stack>
        <Text fz="xs" fw={500}>
          JSON Path
        </Text>
        <ScrollArea.Autosize maw={600}>
          <CodeHighlight
            code={jsonPathToString(nodeData?.path)}
            miw={350}
            mah={250}
            language="json"
            copyLabel="Copy to clipboard"
            copiedLabel="Copied to clipboard"
            withCopyButton
          />
        </ScrollArea.Autosize>
      </Stack>
    </Modal>
  );
};
